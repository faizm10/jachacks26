"""
Motion-derived spatial map from camera video.

Two pipelines:
  1. YOLOv8 person detection + homography (when a corridor calibration is provided).
     Detects people per frame via neural net, maps foot positions through H onto the
     floor plan, renders a Gaussian density heatmap masked to the corridor polygon.

  2. Frame-differencing fallback (legacy, no calibration needed).
     Accumulates pixel-diff between consecutive frames, warps to floor ROI.
"""
from __future__ import annotations

import base64
import os
import re
import tempfile
from typing import Any
from urllib.parse import unquote

import cv2
import httpx
import numpy as np
from pydantic import BaseModel, Field, HttpUrl

from app.calibrations import CorridorCalibration

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
GRID_W = int(os.environ.get("FLOORPLAN_GRID_W", "32"))
GRID_H = int(os.environ.get("FLOORPLAN_GRID_H", "24"))
MAX_BYTES = int(os.environ.get("FLOORPLAN_MAX_BYTES", str(25 * 1024 * 1024)))
MAX_SECONDS = float(os.environ.get("FLOORPLAN_MAX_SECONDS", "20"))
FRAME_STRIDE = int(os.environ.get("FLOORPLAN_FRAME_STRIDE", "2"))
# Sample every N frames for YOLO detection (lower = more samples, slower)
HOG_STRIDE = int(os.environ.get("FLOORPLAN_HOG_STRIDE", "8"))
PROCESS_W = int(os.environ.get("FLOORPLAN_PROCESS_W", "320"))
PROCESS_H = int(os.environ.get("FLOORPLAN_PROCESS_H", "180"))
# YOLOv8 config
_YOLO_MODEL_NAME = os.environ.get("FLOORPLAN_YOLO_MODEL", "yolov8s.pt")  # "small" — 4× more accurate than nano
_YOLO_CONF = float(os.environ.get("FLOORPLAN_YOLO_CONF", "0.10"))        # very low — catch seated/partial/phone-using people
_YOLO_IOU = float(os.environ.get("FLOORPLAN_YOLO_IOU", "0.45"))          # NMS IoU overlap threshold
_YOLO_IMGSZ = int(os.environ.get("FLOORPLAN_YOLO_IMGSZ", "1280"))        # larger = catches small/distant people
# Tiling: fraction of frame height for the "background" crop (people far from camera)
_TILE_SPLITS = [
    (0.0, 0.60),   # top 60%  — background / distant people (small in frame)
    (0.40, 1.0),   # bottom 60% — foreground / closer people
]

# Legacy ROIs (frame-diff fallback for IMG_5530)
_DEFAULT_VIDEO_ROI = (8.0, 20.0, 84.0, 58.0)
_DEFAULT_FLOOR_ROI = (6.0, 44.0, 88.0, 12.0)


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    video_url: HttpUrl
    # Legacy frame-diff corridor warp (null = auto-detect from IMG_5530 filename)
    corridor_map: bool | None = None
    # HOG+homography pipeline: use stored calibration by camera_id
    camera_id: str | None = None
    # Or pass the calibration inline (takes precedence over camera_id lookup)
    calibration: CorridorCalibration | None = None


class FloorPlanZoneOut(BaseModel):
    id: str
    label: str
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)
    w: float = Field(..., ge=0, le=100)
    h: float = Field(..., ge=0, le=100)
    occupancy: float = Field(..., ge=0, le=1)
    motionScore: float | None = None


class FloorPlanAnalyzeResponse(BaseModel):
    roomName: str
    width: int = 100
    height: int = 100
    zones: list[FloorPlanZoneOut]
    source: str = "video"
    overlayDataUrl: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# YOLOv8-small person detection pipeline  — maximum recall strategy
#
# Security cameras at height create two detection challenges:
#   A) People far from the camera appear tiny (< 50px tall in a 1080p frame).
#      Standard full-frame inference at 1280px still shrinks them too much.
#      → Tiled inference: crop each region and run at full imgsz so small
#        people appear large relative to the input.
#
#   B) Mixed lighting (bright windows + fluorescent strips) creates regions
#      that are over-exposed or shadowed, hiding people from the model.
#      → CLAHE contrast equalisation on the L channel of LAB space.
#
#   C) Low-activity poses (phone, laptop, head-down) produce low YOLO scores.
#      → Very low confidence threshold (0.10) to catch edge cases.
#
# Inference passes per frame:
#   1. Full frame + TTA (augment=True: 3 scales × 2 flips internally)
#   2. Full frame CLAHE (catches people in harsh lighting)
#   3-N. Tiled crops at original resolution (catches small/distant people)
#   All passes merged with cross-pass IoU NMS.
# ---------------------------------------------------------------------------

_yolo_model = None  # lazy singleton


def _get_yolo():
    """Load YOLOv8-small once and cache as module-level singleton."""
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO  # noqa: PLC0415
        _yolo_model = YOLO(_YOLO_MODEL_NAME)
    return _yolo_model


def _clahe_enhance(frame_bgr: np.ndarray) -> np.ndarray:
    """CLAHE on L channel of LAB — equalises contrast across tiles of the frame."""
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return cv2.cvtColor(cv2.merge([clahe.apply(l_ch), a_ch, b_ch]), cv2.COLOR_LAB2BGR)


def _run_yolo(
    model,
    img_bgr: np.ndarray,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
    augment: bool = False,
) -> list[tuple[float, float, float, float, float]]:
    """
    Single YOLO inference pass on img_bgr.
    offset_x / offset_y translate tile-local coords back to full-frame coords.
    Returns [(x1, y1, x2, y2, conf), ...] in full-frame pixel coords.
    """
    results = model(
        img_bgr,
        classes=[0],
        conf=_YOLO_CONF,
        iou=_YOLO_IOU,
        imgsz=_YOLO_IMGSZ,
        augment=augment,
        verbose=False,
    )
    out: list[tuple[float, float, float, float, float]] = []
    boxes = results[0].boxes
    if boxes is not None and len(boxes):
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        for (x1, y1, x2, y2), c in zip(xyxy, confs):
            out.append((
                float(x1) + offset_x, float(y1) + offset_y,
                float(x2) + offset_x, float(y2) + offset_y,
                float(c),
            ))
    return out


def _iou(a: tuple, b: tuple) -> float:
    ix1 = max(a[0], b[0]); iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2]); iy2 = min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / max(union, 1e-6)


def _nms_merge(
    all_boxes: list[tuple[float, float, float, float, float]],
    iou_thresh: float = 0.40,
) -> list[tuple[float, float, float, float]]:
    """Greedy NMS across all passes. Higher-conf box wins when IoU > threshold."""
    kept: list[tuple[float, float, float, float]] = []
    for box in sorted(all_boxes, key=lambda b: b[4], reverse=True):
        if not any(_iou(box, (*k, 1.0)) > iou_thresh for k in kept):
            kept.append((box[0], box[1], box[2], box[3]))
    return kept


def _feet_from_frame(frame_bgr: np.ndarray) -> list[tuple[float, float]]:
    """
    Multi-pass YOLOv8 inference optimised for overhead security cameras.

    Pass layout (per frame):
      1. Full frame, augment=True  — global context, foreground people
      2. Full frame CLAHE          — people in over/under-exposed zones
      3+. Horizontal tile crops    — zooms into each region so small/distant
                                     people fill more pixels at inference time

    All detections are merged with IoU-NMS before computing foot positions.
    Foot = bottom-centre of bbox (floor contact for standing; seat level for
    seated people, which is still their actual floor position laterally).
    """
    model = _get_yolo()
    h, w = frame_bgr.shape[:2]
    clahe_frame = _clahe_enhance(frame_bgr)

    all_boxes: list[tuple[float, float, float, float, float]] = []

    # Pass 1 — full frame with TTA
    all_boxes += _run_yolo(model, frame_bgr, augment=True)

    # Pass 2 — CLAHE full frame (no TTA — already covered by pass 1 scale variety)
    all_boxes += _run_yolo(model, clahe_frame, augment=False)

    # Passes 3-N — horizontal tile crops on CLAHE frame
    # Each crop covers a vertical band; running at _YOLO_IMGSZ magnifies
    # small people who are distant from the camera.
    for y_frac_start, y_frac_end in _TILE_SPLITS:
        y0 = int(h * y_frac_start)
        y1 = int(h * y_frac_end)
        tile = clahe_frame[y0:y1, :]
        all_boxes += _run_yolo(model, tile, offset_x=0.0, offset_y=float(y0), augment=False)

    merged = _nms_merge(all_boxes)

    return [((x1 + x2) / 2.0, y2) for x1, y1, x2, y2 in merged]


def _points_are_collinear(pts_pct: list[list[float]]) -> bool:
    """Return True if all calibration points lie on a single line (degenerate homography)."""
    if len(pts_pct) < 3:
        return True
    arr = np.array(pts_pct, dtype=np.float64)
    # Check area of convex hull — collinear points have zero area
    hull = cv2.convexHull(arr.astype(np.float32))
    area = cv2.contourArea(hull)
    return area < 1.0   # < 1 unit² in %-space → essentially collinear


def _compute_homography(cal: CorridorCalibration, cam_w: int, cam_h: int) -> np.ndarray:
    """
    Compute 3x3 homography H: camera pixel coords -> floor plan pixel coords.
    Raises ValueError with a human-readable message if the calibration is degenerate.
    """
    if _points_are_collinear(cal.camera_pts):
        raise ValueError(
            f"Calibration '{cal.label or cal.camera_id}' has collinear camera points — "
            "please redo calibration and click 4 corners that form a proper quadrilateral."
        )
    if _points_are_collinear(cal.floor_pts):
        raise ValueError(
            f"Calibration '{cal.label or cal.camera_id}' has collinear floor plan points — "
            "please redo calibration and click 4 corners that form a proper quadrilateral."
        )

    src = np.array(
        [[x / 100.0 * cam_w, y / 100.0 * cam_h] for x, y in cal.camera_pts],
        dtype=np.float32,
    )
    dst = np.array(
        [[x / 100.0 * cal.floor_w, y / 100.0 * cal.floor_h] for x, y in cal.floor_pts],
        dtype=np.float32,
    )
    H, _ = cv2.findHomography(src, dst, method=0)
    if H is None:
        raise ValueError(
            f"Calibration '{cal.label or cal.camera_id}': OpenCV could not compute homography. "
            "Make sure the 4 point pairs are spread out and non-collinear."
        )
    return H


def _corridor_mask(cal: CorridorCalibration) -> np.ndarray:
    """uint8 mask: 255 inside corridor polygon, 0 outside (at floor plan resolution)."""
    pts = np.array(
        [[int(x / 100.0 * cal.floor_w), int(y / 100.0 * cal.floor_h)] for x, y in cal.floor_pts],
        dtype=np.int32,
    )
    mask = np.zeros((cal.floor_h, cal.floor_w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, pts, 255)
    return mask


def _person_heatmap(
    cap: cv2.VideoCapture,
    H: np.ndarray,
    cal: CorridorCalibration,
    mask: np.ndarray,
    max_frames: int,
) -> tuple[np.ndarray, int]:
    """
    Run YOLOv8 on sampled frames, transform foot positions through homography H,
    accumulate a density grid (floor_h × floor_w).
    Returns (density float64, total_detections).
    """
    density = np.zeros((cal.floor_h, cal.floor_w), dtype=np.float64)
    total_det = 0
    read_idx = 0

    while read_idx < max_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, read_idx)
        ok, frame = cap.read()
        if not ok:
            break

        feet = _feet_from_frame(frame)
        if feet:
            total_det += len(feet)
            pts_cam = np.array([[fx, fy] for fx, fy in feet], dtype=np.float32).reshape(-1, 1, 2)
            pts_floor = cv2.perspectiveTransform(pts_cam, H).reshape(-1, 2)
            for fpx, fpy in pts_floor:
                ix, iy = int(round(float(fpx))), int(round(float(fpy)))
                if 0 <= ix < cal.floor_w and 0 <= iy < cal.floor_h and mask[iy, ix]:
                    density[iy, ix] += 1.0

        read_idx += HOG_STRIDE

    # Gaussian blur — spread each foot-point into a smooth footprint
    sigma = max(cal.floor_h // 30, 15)
    if density.max() > 0:
        density = cv2.GaussianBlur(
            density.astype(np.float32), (0, 0), sigmaX=sigma, sigmaY=sigma
        ).astype(np.float64)

    # Zero outside corridor polygon
    density *= mask.astype(np.float64) / 255.0
    return density, total_det


def _render_corridor_overlay(density: np.ndarray, mask: np.ndarray) -> str | None:
    """
    RGBA PNG: transparent outside corridor, JET colormap with alpha ~ intensity inside.
    Sized to match the floor plan exactly for pixel-perfect overlay.
    """
    if density.max() < 1e-9:
        return None

    norm = (density / density.max() * 255.0).astype(np.uint8)
    colored_bgr = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    colored_bgra = cv2.cvtColor(colored_bgr, cv2.COLOR_BGR2BGRA)

    # Alpha: 0 outside mask; 30-210 inside (low-heat areas show faintly, hot areas opaque)
    alpha = np.zeros(norm.shape, dtype=np.uint8)
    inside = mask > 0
    alpha[inside] = np.clip(norm[inside].astype(np.int32) + 30, 30, 210).astype(np.uint8)
    colored_bgra[:, :, 3] = alpha

    ok, buf = cv2.imencode(".png", colored_bgra)
    if not ok:
        return None
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _zones_from_corridor(density: np.ndarray, cal: CorridorCalibration) -> list[FloorPlanZoneOut]:
    """Extract activity zones from density map, coords expressed as % of floor plan."""
    dmax = float(density.max())
    if dmax < 1e-9:
        return []

    norm = (density / dmax * 255).astype(np.uint8)
    _, binary = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)

    candidates = []
    for lab in range(1, num_labels):
        x, y, w, h, area = stats[lab]
        if area < 200:
            continue
        roi = density[y : y + h, x : x + w]
        score = float(roi.mean())
        candidates.append((x, y, w, h, area, score))

    candidates.sort(key=lambda t: t[4] * t[5], reverse=True)
    candidates = candidates[:5]

    zone_labels = ["Primary cluster", "Secondary cluster", "Peripheral motion", "Edge activity", "Micro cluster"]
    zones = []
    for i, (x, y, w, h, _area, score) in enumerate(candidates):
        x_pct = x / cal.floor_w * 100
        y_pct = y / cal.floor_h * 100
        w_pct = w / cal.floor_w * 100
        h_pct = h / cal.floor_h * 100
        occ = score / dmax
        zones.append(FloorPlanZoneOut(
            id=f"z{i}",
            label=zone_labels[i] if i < len(zone_labels) else f"Zone {i + 1}",
            x=x_pct, y=y_pct,
            w=max(w_pct, 1.5), h=max(h_pct, 1.5),
            occupancy=min(1.0, occ),
            motionScore=score,
        ))
    return zones


def _analyze_with_calibration(
    path: str,
    cal: CorridorCalibration,
    video_url: str,
) -> FloorPlanAnalyzeResponse:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("Could not open video (codec or format unsupported)")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    nframes = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cam_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
    cam_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)
    cap.release()

    max_frames = int(fps * MAX_SECONDS)
    if nframes > 0:
        max_frames = min(max_frames, nframes)

    # Validate homography before downloading — gives clear error if calibration is bad
    H = _compute_homography(cal, cam_w, cam_h)
    mask = _corridor_mask(cal)

    # Re-open for frame reading
    cap = cv2.VideoCapture(path)

    density, total_det = _person_heatmap(cap, H, cal, mask, max_frames)
    cap.release()

    overlay = _render_corridor_overlay(density, mask)
    zones = _zones_from_corridor(density, cal)

    if not zones:
        # Corridor bounding box as placeholder when no people detected
        xs = [p[0] for p in cal.floor_pts]
        ys = [p[1] for p in cal.floor_pts]
        zones = [FloorPlanZoneOut(
            id="z0", label="No people detected",
            x=min(xs), y=min(ys),
            w=max(xs) - min(xs), h=max(ys) - min(ys),
            occupancy=0.0, motionScore=0.0,
        )]

    return FloorPlanAnalyzeResponse(
        roomName="Corridor activity map",
        width=100, height=100,
        zones=zones,
        source="video",
        overlayDataUrl=overlay,
        meta={
            "pipeline": "yolo_homography",
            "camera_id": cal.camera_id,
            "corridorLabel": cal.label or cal.camera_id,
            "totalDetections": total_det,
            "frameStride": HOG_STRIDE,
            "yoloModel": _YOLO_MODEL_NAME,
            "yoloConf": _YOLO_CONF,
            "yoloImgsz": _YOLO_IMGSZ,
            "videoSize": {"w": cam_w, "h": cam_h},
            "floorPlanSize": {"w": cal.floor_w, "h": cal.floor_h},
        },
    )


# ---------------------------------------------------------------------------
# Legacy frame-differencing pipeline
# ---------------------------------------------------------------------------

def _parse_roi(env_key: str, default: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    raw = os.environ.get(env_key)
    if not raw:
        return default
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
    except ValueError:
        return default
    if len(parts) != 4:
        return default
    x, y, w, h = parts
    if w <= 0 or h <= 0:
        return default
    return (x, y, w, h)


def _url_suggests_img5530(video_url: str) -> bool:
    s = unquote(video_url.lower())
    return "img_5530" in s or "img5530" in s


def _should_corridor_map(video_url: str, flag: bool | None) -> bool:
    if flag is True:
        return True
    if flag is False:
        return False
    return _url_suggests_img5530(video_url)


def _bilinear_sample(heat: np.ndarray, u_pct: float, v_pct: float) -> float:
    gh, gw = heat.shape
    gx = (u_pct / 100.0) * gw - 0.5
    gy = (v_pct / 100.0) * gh - 0.5
    x0 = int(np.floor(gx)); y0 = int(np.floor(gy))
    x1 = min(x0 + 1, gw - 1); y1 = min(y0 + 1, gh - 1)
    x0 = max(0, x0); y0 = max(0, y0)
    dx = float(gx - x0); dy = float(gy - y0)
    return float(
        (1 - dx) * (1 - dy) * heat[y0, x0]
        + dx * (1 - dy) * heat[y0, x1]
        + (1 - dx) * dy * heat[y1, x0]
        + dx * dy * heat[y1, x1]
    )


def _warp_heat_video_to_floor(
    heat_n: np.ndarray,
    video_roi: tuple[float, float, float, float],
    floor_roi: tuple[float, float, float, float],
) -> np.ndarray:
    gh, gw = heat_n.shape
    vx, vy, vw, vh = video_roi
    fx, fy, fw, fh = floor_roi
    out = np.zeros((gh, gw), dtype=np.float64)
    for gi in range(gh):
        for gj in range(gw):
            fu = (gj + 0.5) / gw * 100.0
            fv = (gi + 0.5) / gh * 100.0
            if fu < fx or fu > fx + fw or fv < fy or fv > fy + fh:
                continue
            tu = (fu - fx) / fw
            tv = (fv - fy) / fh
            out[gi, gj] = _bilinear_sample(heat_n, vx + tu * vw, vy + tv * vh)
    return out


def _zones_from_heat(heat_n: np.ndarray) -> list[FloorPlanZoneOut]:
    hmin, hmax = float(heat_n.min()), float(heat_n.max())
    if hmax <= hmin + 1e-9:
        heat_u8 = np.zeros_like(heat_n, dtype=np.uint8)
        heat_n = np.zeros_like(heat_n)
    else:
        heat_n = (heat_n - hmin) / (hmax - hmin)
        heat_u8 = (heat_n * 255).astype(np.uint8)

    _, binary = cv2.threshold(heat_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    candidates = []
    max_intensity = float(heat_n.max()) or 1.0

    for lab in range(1, num_labels):
        x, y, w, h, area = stats[lab]
        if area < 4:
            continue
        roi = heat_n[y : y + h, x : x + w]
        candidates.append((x, y, w, h, area, float(roi.mean())))

    candidates.sort(key=lambda t: t[4] * t[5], reverse=True)
    candidates = candidates[:5]
    zone_labels = ["Primary activity", "Secondary zone", "Peripheral motion", "Quiet edge", "Micro cluster"]

    if not candidates:
        ys, xs = np.where(heat_n > heat_n.mean())
        if len(xs) == 0:
            return [FloorPlanZoneOut(id="z0", label="Uniform field", x=10, y=10, w=80, h=80, occupancy=0.2, motionScore=0.0)]
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        occ = float(heat_n[y0:y1, x0:x1].mean()) / max_intensity
        return [FloorPlanZoneOut(id="z0", label="Motion field",
            x=x0/GRID_W*100, y=y0/GRID_H*100,
            w=max((x1-x0)/GRID_W*100, 8), h=max((y1-y0)/GRID_H*100, 8),
            occupancy=min(1, occ), motionScore=occ)]

    zones = []
    for i, (x, y, w, h, _area, score) in enumerate(candidates):
        pad = 1
        x0 = max(0, x - pad); y0 = max(0, y - pad)
        x1 = min(GRID_W, x + w + pad); y1 = min(GRID_H, y + h + pad)
        roi = heat_n[y0:y1, x0:x1]
        occ = float(roi.mean()) / max_intensity if max_intensity > 0 else 0.0
        zones.append(FloorPlanZoneOut(
            id=f"z{i}", label=zone_labels[i] if i < len(zone_labels) else f"Zone {i+1}",
            x=x0/GRID_W*100, y=y0/GRID_H*100,
            w=max((x1-x0)/GRID_W*100, 6), h=max((y1-y0)/GRID_H*100, 6),
            occupancy=min(1, occ), motionScore=score,
        ))
    return zones


def _overlay_png_from_heat_u8(heat_u8: np.ndarray) -> str | None:
    colored = cv2.applyColorMap(heat_u8, cv2.COLORMAP_INFERNO)
    colored = cv2.resize(colored, (GRID_W * 8, GRID_H * 8), interpolation=cv2.INTER_NEAREST)
    ok, buf = cv2.imencode(".png", colored)
    if not ok:
        return None
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _analyze_video_path_framediff(
    path: str, video_url: str, corridor_map: bool | None
) -> FloorPlanAnalyzeResponse:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("Could not open video (codec or format unsupported)")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    nframes = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)

    max_frames = int(fps * MAX_SECONDS)
    if nframes > 0:
        max_frames = min(max_frames, nframes)

    acc = np.zeros((PROCESS_H, PROCESS_W), dtype=np.float64)
    prev_gray: np.ndarray | None = None
    read_idx = 0
    processed = 0

    while read_idx < max_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, read_idx)
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (PROCESS_W, PROCESS_H), interpolation=cv2.INTER_AREA)
        if prev_gray is not None:
            diff = cv2.absdiff(small, prev_gray)
            acc += diff.astype(np.float64)
            processed += 1
        prev_gray = small
        read_idx += FRAME_STRIDE

    cap.release()

    if processed < 2:
        raise ValueError("Not enough frames sampled — try a longer clip or lower stride")

    heat = cv2.resize(acc, (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
    hmin, hmax = float(heat.min()), float(heat.max())
    heat_n = np.zeros_like(heat) if hmax <= hmin + 1e-9 else (heat - hmin) / (hmax - hmin)

    meta: dict[str, Any] = {
        "pipeline": "frame_diff",
        "videoSize": {"w": vw, "h": vh},
        "framesSampled": processed,
        "maxSeconds": MAX_SECONDS,
    }

    use_corridor = _should_corridor_map(str(video_url), corridor_map)
    if use_corridor:
        video_roi = _parse_roi("FLOORPLAN_IMG5530_VIDEO_ROI", _DEFAULT_VIDEO_ROI)
        floor_roi = _parse_roi("FLOORPLAN_IMG5530_FLOOR_ROI", _DEFAULT_FLOOR_ROI)
        heat_n = _warp_heat_video_to_floor(heat_n, video_roi, floor_roi)
        hmin2, hmax2 = float(heat_n.min()), float(heat_n.max())
        heat_n = np.zeros_like(heat_n) if hmax2 <= hmin2 + 1e-9 else (heat_n - hmin2) / (hmax2 - hmin2)
        meta["mapping"] = "corridor_img5530"
        meta["videoRoiPct"] = {"x": video_roi[0], "y": video_roi[1], "w": video_roi[2], "h": video_roi[3]}
        meta["floorRoiPct"] = {"x": floor_roi[0], "y": floor_roi[1], "w": floor_roi[2], "h": floor_roi[3]}

    zones = _zones_from_heat(heat_n)
    hmin, hmax = float(heat_n.min()), float(heat_n.max())
    heat_u8 = np.zeros_like(heat_n, dtype=np.uint8) if hmax <= hmin + 1e-9 else ((heat_n - hmin) / (hmax - hmin) * 255).astype(np.uint8)
    overlay_b64 = _overlay_png_from_heat_u8(heat_u8)

    return FloorPlanAnalyzeResponse(
        roomName="Spatial motion map", width=100, height=100,
        zones=zones, source="video", overlayDataUrl=overlay_b64, meta=meta,
    )


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def _download_video(url: str) -> str:
    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            total = 0
            chunks: list[bytes] = []
            for chunk in resp.iter_bytes(1024 * 64):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError(f"Video exceeds max download size ({MAX_BYTES} bytes)")
                chunks.append(chunk)
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    with open(path, "wb") as f:
        f.write(b"".join(chunks))
    return path


def analyze_from_url(
    video_url: str,
    corridor_map: bool | None = None,
    calibration: CorridorCalibration | None = None,
) -> FloorPlanAnalyzeResponse:
    if not re.match(r"^https?://", str(video_url), re.I):
        raise ValueError("video_url must be http(s)")
    path = _download_video(str(video_url))
    try:
        if calibration is not None:
            # Validate calibration before running the full pipeline.
            # If the calibration is degenerate (e.g. collinear test points),
            # fall back to frame-diff rather than returning a 500 error.
            try:
                return _analyze_with_calibration(path, calibration, video_url)
            except ValueError as cal_err:
                # Re-raise only if it's a fundamental video error, not a bad calibration
                msg = str(cal_err)
                if "collinear" in msg or "homography" in msg.lower() or "quadrilateral" in msg:
                    print(f"[floorplan] Bad calibration ({calibration.camera_id}): {msg} — falling back to frame-diff")
                    return _analyze_video_path_framediff(path, video_url, corridor_map)
                raise
        return _analyze_video_path_framediff(path, video_url, corridor_map)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
