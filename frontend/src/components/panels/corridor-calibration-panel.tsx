"use client";

/**
 * Corridor Calibration Panel
 *
 * Step 1: Pick a camera (video from Supabase bucket).
 * Step 2: Click 4 corners of the corridor in the camera view.
 * Step 3: Click the 4 matching corners on the floor plan.
 * Step 4: Save — the backend stores the homography points.
 * Open an existing row with **Edit** to change corners; use **Clear camera/floor corners** then click again.
 *
 * After calibration, the analyze endpoint uses YOLO foot positions +
 * homography to project detections onto the floor plan corridor.
 */

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { saveCalibration, listCalibrations, deleteCalibration } from "@/lib/api/calibration";
import type { CorridorCalibration } from "@/lib/api/calibration";
import {
  clientPointToIntrinsicPercent,
  containedRect,
  intrinsicPercentToDisplayPercent,
} from "@/lib/spatial/contained-media-pointer";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FLOOR_W = 1536;
const FLOOR_H = 1024;

const POINT_COLORS = ["#f87171", "#fb923c", "#a3e635", "#38bdf8"] as const;
const POINT_LABELS = ["A", "B", "C", "D"] as const;

type XY = [number, number]; // percentage 0–100

function stemFromPath(path: string): string {
  return (path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path).trim().toLowerCase();
}

function findVideoForCameraId(objects: CamsLatestObject[], cameraId: string): CamsLatestObject | null {
  const id = cameraId.trim().toLowerCase();
  return (
    objects.filter((o) => o.kind === "video").find((o) => stemFromPath(o.path) === id) ?? null
  );
}

function PointMarker({ idx, x, y }: { idx: number; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-black/40 text-[10px] font-bold text-white shadow-lg"
      style={{ left: `${x}%`, top: `${y}%`, backgroundColor: POINT_COLORS[idx] }}
    >
      {POINT_LABELS[idx]}
    </div>
  );
}

function ClickablePanel({
  src,
  isVideo,
  videoRef,
  intrinsicW,
  intrinsicH,
  points,
  onClickPt,
  label,
  hint,
  showPlayToggle,
}: {
  src: string;
  isVideo: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** Native pixel size of the frame (video) or logical floor image size used by the backend */
  intrinsicW: number;
  intrinsicH: number;
  points: XY[];
  onClickPt: (pt: XY) => void;
  label: string;
  hint: string;
  /** Camera panel: show play/pause while placing points */
  showPlayToggle?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ cw: 0, ch: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ cw: r.width, ch: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBox({ cw: r.width, ch: r.height });
    return () => ro.disconnect();
  }, []);

  const ready =
    intrinsicW > 0 &&
    intrinsicH > 0 &&
    box.cw > 0 &&
    box.ch > 0;

  const displayPoints = useMemo(() => {
    if (!ready) return [] as XY[];
    return points.map(([ix, iy]) =>
      intrinsicPercentToDisplayPercent(ix, iy, box.cw, box.ch, intrinsicW, intrinsicH),
    );
  }, [points, ready, box.cw, box.ch, intrinsicW, intrinsicH]);

  const frameOutline = useMemo(() => {
    if (!ready) return null;
    const { offsetX, offsetY, drawW, drawH } = containedRect(box.cw, box.ch, intrinsicW, intrinsicH);
    return {
      left: (offsetX / box.cw) * 100,
      top: (offsetY / box.ch) * 100,
      width: (drawW / box.cw) * 100,
      height: (drawH / box.ch) * 100,
    };
  }, [ready, box.cw, box.ch, intrinsicW, intrinsicH]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (points.length >= 4) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !ready) return;
      const pct = clientPointToIntrinsicPercent(
        e.clientX,
        e.clientY,
        rect,
        intrinsicW,
        intrinsicH,
      );
      if (!pct) return;
      onClickPt([pct[0], pct[1]]);
    },
    [points.length, onClickPt, ready, intrinsicW, intrinsicH],
  );

  const togglePlay = useCallback(() => {
    const v = videoRef?.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [videoRef]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {showPlayToggle && videoRef ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-foreground backdrop-blur-sm hover:bg-muted/80"
          >
            Preview play/pause
          </button>
        ) : null}
      </div>
      <div
        ref={containerRef}
        onClick={handleClick}
        className={`relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-stone-950 ${
          points.length < 4 && ready ? "cursor-crosshair" : "cursor-default"
        }`}
      >
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70">
            <p className="text-xs text-muted-foreground">
              {isVideo ? "Loading video dimensions…" : "Loading…"}
            </p>
          </div>
        ) : null}

        {isVideo ? (
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            src={src}
            className="h-full w-full object-contain"
            muted
            playsInline
            loop
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Floor plan" className="h-full w-full object-contain" />
        )}

        {ready && frameOutline ? (
          <div
            className="pointer-events-none absolute box-border rounded-md border border-emerald-400/35 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.12)]"
            style={{
              left: `${frameOutline.left}%`,
              top: `${frameOutline.top}%`,
              width: `${frameOutline.width}%`,
              height: `${frameOutline.height}%`,
            }}
            aria-hidden
          />
        ) : null}

        {displayPoints.map((pt, i) => (
          <PointMarker key={i} idx={i} x={pt[0]} y={pt[1]} />
        ))}

        {displayPoints.length >= 2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={[...displayPoints, displayPoints[0]]
                .slice(0, displayPoints.length + (displayPoints.length === 4 ? 1 : 0))
                .map((p) => `${p[0]}%,${p[1]}%`)
                .join(" ")}
              fill={displayPoints.length === 4 ? "rgba(255,255,255,0.07)" : "none"}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.8"
              strokeDasharray={displayPoints.length < 4 ? "4 3" : "none"}
            />
          </svg>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Right-hand floor panel that shows the 3D library view.
 * An absolute overlay captures clicks (in place-mode) and maps them to
 * `FLOOR_W × FLOOR_H` intrinsic percentage coordinates — the same coordinate
 * space the backend homography uses.  Since the 3D canvas is `aspect-[3/2]`
 * and the floor PNG is 1536×1024 (3:2), there is never any letterboxing.
 */
function FloorThreeClickPanel({
  points,
  onClickPt,
  label,
  hint,
}: {
  points: XY[];
  onClickPt: (pt: XY) => void;
  label: string;
  hint: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setContainerSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  const ready = containerSize.w > 0 && containerSize.h > 0;
  const placing = points.length < 4;

  const displayPoints = useMemo(() => {
    if (!ready) return [] as XY[];
    return points.map(([ix, iy]) =>
      intrinsicPercentToDisplayPercent(ix, iy, containerSize.w, containerSize.h, FLOOR_W, FLOOR_H),
    );
  }, [points, ready, containerSize.w, containerSize.h]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placing) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect || !ready) return;
      const pct = clientPointToIntrinsicPercent(e.clientX, e.clientY, rect, FLOOR_W, FLOOR_H);
      if (!pct) return;
      onClickPt([pct[0], pct[1]]);
    },
    [placing, onClickPt, ready],
  );

  const canvasOverlay = (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0 z-30",
        placing ? "cursor-crosshair pointer-events-auto" : "pointer-events-none",
      )}
      onClick={handleClick}
    >
      {/* Mode badge */}
      {placing && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-900">
          Place mode · orbit paused
        </div>
      )}

      {/* Point markers */}
      {displayPoints.map((pt, i) => (
        <PointMarker key={i} idx={i} x={pt[0]} y={pt[1]} />
      ))}

      {/* Connecting polyline */}
      {displayPoints.length >= 2 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <polyline
            points={[
              ...displayPoints,
              ...(displayPoints.length === 4 ? [displayPoints[0]] : []),
            ]
              .map((p) => `${p[0]}%,${p[1]}%`)
              .join(" ")}
            fill={displayPoints.length === 4 ? "rgba(255,255,255,0.07)" : "none"}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.8"
            strokeDasharray={displayPoints.length < 4 ? "4 3" : "none"}
          />
        </svg>
      )}

      {/* Hint gradient bar at bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <JohnAbbottLibraryFloorThree canvasChildren={canvasOverlay} />
    </div>
  );
}

function CalibrationModal({
  onClose,
  onSaved,
  initialCalibration,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** When set, modal opens in edit mode with these points (camera clip matched by `camera_id`). */
  initialCalibration: CorridorCalibration | null;
}) {
  const { objects } = useCamsAllFeeds();
  const [selectedCam, setSelectedCam] = useState<CamsLatestObject | null>(null);
  const [cameraPts, setCameraPts] = useState<XY[]>([]);
  const [floorPts, setFloorPts] = useState<XY[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraIntrinsic, setCameraIntrinsic] = useState<{ w: number; h: number } | null>(null);
  const hydratedEditKey = useRef<string | null>(null);

  const videoObjects = objects.filter((o) => o.kind === "video");
  const isEditMode = initialCalibration != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setCameraIntrinsic(null);
  }, [selectedCam?.url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !selectedCam || selectedCam.kind !== "video") return;
    const sync = () => {
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setCameraIntrinsic({ w: v.videoWidth, h: v.videoHeight });
      }
    };
    v.addEventListener("loadedmetadata", sync);
    v.addEventListener("loadeddata", sync);
    sync();
    return () => {
      v.removeEventListener("loadedmetadata", sync);
      v.removeEventListener("loadeddata", sync);
    };
  }, [selectedCam?.url, selectedCam?.kind]);

  /** Pause and reset scrub while placing camera corners (clearer, matches saved frame coords). */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !selectedCam || selectedCam.kind !== "video") return;
    if (cameraPts.length < 4) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [cameraPts.length, selectedCam?.url, selectedCam?.kind]);

  /** Edit mode: load saved points once per calibration; keep matching clip in sync when bucket loads. */
  useEffect(() => {
    if (!initialCalibration) {
      hydratedEditKey.current = null;
      return;
    }
    const key = `edit:${initialCalibration.camera_id}`;
    if (hydratedEditKey.current !== key) {
      hydratedEditKey.current = key;
      setCameraPts(
        initialCalibration.camera_pts.map((p) => [p[0], p[1]] as XY),
      );
      setFloorPts(initialCalibration.floor_pts.map((p) => [p[0], p[1]] as XY));
      setLabel(initialCalibration.label ?? "");
    }
    setSelectedCam(findVideoForCameraId(objects, initialCalibration.camera_id));
  }, [initialCalibration, objects]);

  const cameraId = selectedCam
    ? (
        selectedCam.path.split("/").pop()?.replace(/\.[^.]+$/, "") ??
        selectedCam.path
      ).trim().toLowerCase()
    : "";

  const handleSave = useCallback(async () => {
    if (!selectedCam || cameraPts.length < 4 || floorPts.length < 4) return;
    setSaving(true);
    setError(null);
    try {
      const cal: CorridorCalibration = {
        camera_id: cameraId,
        camera_pts: cameraPts as [number, number][],
        floor_pts: floorPts as [number, number][],
        floor_w: FLOOR_W,
        floor_h: FLOOR_H,
        label: label || cameraId,
      };
      await saveCalibration(cal);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [selectedCam, cameraPts, floorPts, cameraId, label, onSaved, onClose]);

  const reset = useCallback(() => {
    setCameraPts([]);
    setFloorPts([]);
  }, []);

  const clearCameraCorners = useCallback(() => {
    setCameraPts([]);
    setFloorPts([]);
  }, []);

  const clearFloorCorners = useCallback(() => {
    setFloorPts([]);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-stone-900/35 backdrop-blur-md" />
      <motion.div
        className="relative z-10 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-[0_24px_60px_rgba(62,48,40,0.14)]"
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border/80 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {isEditMode ? "Edit corridor calibration" : "Corridor calibration"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Maps a camera clip to the{" "}
              <strong className="text-foreground">3D floor plan</strong> for homography (analysis
              overlay). Mark 4 matching corners on the{" "}
              <strong className="text-foreground">full camera frame</strong> (left), then click the
              same spots on the{" "}
              <strong className="text-foreground">3D floor view</strong> (right — orbit is paused
              while placing). The backend uses{" "}
              <strong className="text-foreground">{FLOOR_W}×{FLOOR_H}</strong> intrinsic coordinates.
              {isEditMode ? " Use Clear to re-place corners, then click again in order A→D." : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 0: Pick camera */}
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Step 1 · Select camera
            </p>
            {isEditMode && initialCalibration ? (
              <div className="space-y-2">
                {selectedCam ? (
                  <p className="text-xs text-muted-foreground">
                    Editing clip{" "}
                    <span className="font-medium text-foreground">
                      {selectedCam.path.split("/").pop() ?? selectedCam.path}
                    </span>{" "}
                    <span className="text-muted-foreground">({initialCalibration.camera_id})</span>
                  </p>
                ) : (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950">
                    No video in the bucket matches camera ID{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-foreground">{initialCalibration.camera_id}</code>.
                    Upload that file (same name) to preview the clip while you adjust points, or remove this
                    calibration and create a new one.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {videoObjects.map((obj) => {
                  const name = obj.path.split("/").pop() ?? obj.path;
                  return (
                    <button
                      key={obj.path}
                      type="button"
                      onClick={() => {
                        if (selectedCam?.path === obj.path) return;
                        setSelectedCam(obj);
                        reset();
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedCam?.path === obj.path
                          ? "border-sky-500/40 bg-sky-500/15 text-sky-900"
                          : "border-border bg-muted/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
                {videoObjects.length === 0 && (
                  <p className="text-xs text-muted-foreground">No videos in cam bucket yet.</p>
                )}
              </div>
            )}
          </div>

          {selectedCam && (
            <>
              {/* Step 1 + 2: Click points */}
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Step 2 · Mark corridor corners (4 points each)
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearCameraCorners}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/25 hover:bg-muted hover:text-foreground/90"
                  >
                    Clear camera corners
                  </button>
                  <button
                    type="button"
                    onClick={clearFloorCorners}
                    disabled={cameraPts.length < 4}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/25 hover:bg-muted hover:text-foreground/90 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Clear floor corners
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ClickablePanel
                    src={selectedCam.url}
                    isVideo={selectedCam.kind === "video"}
                    videoRef={videoRef}
                    intrinsicW={cameraIntrinsic?.w ?? 0}
                    intrinsicH={cameraIntrinsic?.h ?? 0}
                    points={cameraPts}
                    onClickPt={(pt) => {
                      if (cameraPts.length < 4) setCameraPts((p) => [...p, pt]);
                    }}
                    label="Camera view — click the 4 floor-corners of the corridor"
                    hint={
                      !cameraIntrinsic
                        ? "Wait for video dimensions…"
                        : cameraPts.length < 4
                          ? `Click corner ${POINT_LABELS[cameraPts.length]} (${4 - cameraPts.length} remaining) · video paused for accuracy`
                          : "✓ 4 points set"
                    }
                    showPlayToggle
                  />
                  <FloorThreeClickPanel
                    points={floorPts}
                    onClickPt={(pt) => {
                      if (cameraPts.length === 4 && floorPts.length < 4)
                        setFloorPts((p) => [...p, pt]);
                    }}
                    label="3D floor plan — click the same 4 corners in matching order"
                    hint={
                      cameraPts.length < 4
                        ? "Finish camera points first"
                        : floorPts.length < 4
                          ? `Click corner ${POINT_LABELS[floorPts.length]} (${4 - floorPts.length} remaining) · scroll or +/- to zoom · orbit paused while placing`
                          : "✓ 4 points set — orbit controls restored"
                    }
                  />
                </div>
              </div>

              {/* Step 3: Label + save */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                    Corridor label (optional)
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={`e.g. "North corridor"`}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Reset points
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={
                    saving ||
                    !selectedCam ||
                    cameraPts.length < 4 ||
                    floorPts.length < 4
                  }
                  className="rounded-full border border-sky-600/35 bg-sky-600/15 px-5 py-2 text-xs font-semibold text-sky-900 transition-colors hover:bg-sky-600/25 disabled:opacity-40"
                >
                  {saving ? "Saving…" : isEditMode ? "Save changes" : "Save calibration"}
                </button>
              </div>

              {error && (
                <p className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-xs text-red-200/80">
                  {error}
                </p>
              )}
            </>
          )}

          {/* Progress from real counts; old `i <= step` lit “4/4” while still placing video corners. */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/80 pt-4">
            {(
              [
                {
                  key: "cam",
                  label: "1 · Camera",
                  done: Boolean(selectedCam),
                  current: !selectedCam,
                },
                {
                  key: "vid",
                  label: `2 · Video corners ${selectedCam ? `${cameraPts.length}/4` : "—"}`,
                  done: cameraPts.length >= 4,
                  current: Boolean(selectedCam) && cameraPts.length < 4,
                },
                {
                  key: "fl",
                  label: `3 · Floor corners ${selectedCam ? `${floorPts.length}/4` : "—"}`,
                  done: floorPts.length >= 4,
                  current:
                    Boolean(selectedCam) && cameraPts.length >= 4 && floorPts.length < 4,
                },
                {
                  key: "save",
                  label: "4 · Save",
                  done: cameraPts.length >= 4 && floorPts.length >= 4,
                  current:
                    Boolean(selectedCam) && cameraPts.length >= 4 && floorPts.length >= 4,
                },
              ] as const
            ).map((row) => {
              const tone = row.done
                ? "bg-emerald-600/12 text-emerald-900 ring-1 ring-emerald-600/30"
                : row.current
                  ? "bg-sky-500/15 text-sky-900 ring-1 ring-sky-500/35"
                  : "bg-muted/50 text-muted-foreground/80";
              const dot = row.done
                ? "bg-emerald-400"
                : row.current
                  ? "bg-sky-400"
                  : "bg-muted-foreground/25";
              return (
                <div
                  key={row.key}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${tone}`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  {row.label}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function CorridorCalibrationPanel() {
  const [showModal, setShowModal] = useState(false);
  const [editingCalibration, setEditingCalibration] = useState<CorridorCalibration | null>(null);
  const [calibrations, setCalibrations] = useState<CorridorCalibration[]>([]);
  const [loadingCals, setLoadingCals] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const fetchCals = useCallback(async () => {
    setLoadingCals(true);
    setListError(null);
    try {
      const cals = await listCalibrations();
      setCalibrations(cals);
    } catch (e) {
      setCalibrations([]);
      setListError(e instanceof Error ? e.message : "Could not load calibrations");
    } finally {
      setLoadingCals(false);
    }
  }, []);

  useEffect(() => {
    void fetchCals();
  }, [fetchCals]);

  const handleDelete = useCallback(
    async (cameraId: string) => {
      try {
        await deleteCalibration(cameraId);
        await fetchCals();
      } catch {
        /* ignore */
      }
    },
    [fetchCals],
  );

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Camera ↔ corridor calibration"
        subtitle="Homography uses full frame pixels — calibration clicks are mapped through letterboxed video / floor image"
        action={
          <button
            type="button"
            onClick={() => {
              setEditingCalibration(null);
              setShowModal(true);
            }}
            className="rounded-full border border-sky-600/35 bg-sky-600/12 px-3 py-1 text-[11px] font-semibold text-sky-900 transition-colors hover:bg-sky-600/20"
          >
            + New calibration
          </button>
        }
      />

      <div className="mt-3 space-y-2">
        {listError ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950">
            {listError}
          </p>
        ) : null}
        {loadingCals ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : calibrations.length === 0 ? (
          <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-5 text-center">
            <p className="text-sm font-medium text-muted-foreground">No calibrations yet</p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Click <span className="font-medium text-muted-foreground">+ New calibration</span> to map a
              camera to its corridor on the floor plan.
            </p>
          </div>
        ) : (
          calibrations.map((cal) => (
            <div
              key={cal.camera_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/80 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {cal.label || cal.camera_id}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ID: {cal.camera_id} · {cal.camera_pts.length} point pairs ·{" "}
                  {cal.floor_w}×{cal.floor_h} floor plan
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCalibration(cal);
                    setShowModal(true);
                  }}
                  className="rounded-full border border-sky-600/35 bg-sky-600/12 px-2.5 py-1 text-[10px] font-semibold text-sky-900 transition-colors hover:bg-sky-600/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(cal.camera_id)}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-red-400/40 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <CalibrationModal
            key={editingCalibration?.camera_id ?? "new"}
            initialCalibration={editingCalibration}
            onClose={() => {
              setShowModal(false);
              setEditingCalibration(null);
            }}
            onSaved={() => void fetchCals()}
          />
        )}
      </AnimatePresence>
    </GlassPanel>
  );
}
