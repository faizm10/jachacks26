import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load repo-root .env so GEMINI_API_KEY and others are available
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from app import calibrations as cal_store
from app.analyze import (
    AnalyzeFrameBase64Request,
    AnalyzeRequest as GeminiAnalyzeRequest,
    FrameAnalysis,
    analyze_frame,
    analyze_frame_base64,
)
from app.calibrations import CorridorCalibration, normalize_camera_id
from app.floorplan import (
    AnalyzeRequest as FloorplanAnalyzeRequest,
    FloorPlanAnalyzeResponse,
    analyze_from_url,
)

app = FastAPI(title="FoCo API")

_origins = os.environ.get(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
_allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory cache: { url: (result, timestamp) }
_analysis_cache: dict[str, tuple[FrameAnalysis, float]] = {}
CACHE_TTL_SECONDS = 20  # serve cached result for 20s before re-analyzing


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=FrameAnalysis)
async def analyze(req: GeminiAnalyzeRequest):
    now = time.time()

    cached = _analysis_cache.get(req.frame_url)
    if cached:
        result, ts = cached
        if now - ts < CACHE_TTL_SECONDS:
            return result

    try:
        result = await analyze_frame(req)
        _analysis_cache[req.frame_url] = (result, now)

        stale = [k for k, (_, ts) in _analysis_cache.items() if now - ts > 300]
        for k in stale:
            del _analysis_cache[k]

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/analyze-frame", response_model=FrameAnalysis)
async def analyze_frame_endpoint(req: AnalyzeFrameBase64Request):
    """Analyze a single base64-encoded frame for live tracking."""
    import base64

    try:
        img_bytes = base64.b64decode(req.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    if len(img_bytes) < 200:
        raise HTTPException(
            status_code=400,
            detail=f"Image too small ({len(img_bytes)} bytes) — likely a blank frame",
        )

    try:
        result = await analyze_frame_base64(req)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Floor plan analysis
# ---------------------------------------------------------------------------


@app.post("/floorplan/analyze", response_model=FloorPlanAnalyzeResponse)
def floorplan_analyze(body: FloorplanAnalyzeRequest):
    calibration = body.calibration
    if calibration is None and body.camera_id:
        calibration = cal_store.get(body.camera_id)

    try:
        return analyze_from_url(
            str(body.video_url),
            corridor_map=body.corridor_map,
            calibration=calibration,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {e!s}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Corridor calibration CRUD
# ---------------------------------------------------------------------------


@app.get("/calibrations")
def list_calibrations() -> dict:
    all_cals = cal_store.load_all()
    return {"calibrations": [v.model_dump() for v in all_cals.values()]}


@app.get("/calibrations/{camera_id}")
def get_calibration(camera_id: str) -> dict:
    cal = cal_store.get(camera_id)
    if cal is None:
        raise HTTPException(status_code=404, detail=f"No calibration for camera_id={camera_id!r}")
    return cal.model_dump()


@app.post("/calibrations/{camera_id}", status_code=201)
def save_calibration(camera_id: str, body: CorridorCalibration) -> dict:
    if len(body.camera_pts) < 4 or len(body.floor_pts) < 4:
        raise HTTPException(status_code=400, detail="Need at least 4 point pairs for homography")
    if len(body.camera_pts) != len(body.floor_pts):
        raise HTTPException(status_code=400, detail="camera_pts and floor_pts must have the same length")
    body = body.model_copy(update={"camera_id": camera_id})
    try:
        cal_store.upsert(body)
    except OSError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not write calibrations file ({cal_store.STORE_PATH}): {e}",
        ) from e
    return {"saved": True, "camera_id": normalize_camera_id(camera_id)}


@app.delete("/calibrations/{camera_id}")
def delete_calibration(camera_id: str) -> dict:
    deleted = cal_store.delete(camera_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No calibration for camera_id={camera_id!r}")
    return {"deleted": True, "camera_id": camera_id}
