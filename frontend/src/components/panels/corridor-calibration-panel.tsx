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
 * After calibration, the analyze endpoint will use HOG person detection +
 * homography to project detections accurately onto the floor plan corridor.
 */

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { saveCalibration, listCalibrations, deleteCalibration } from "@/lib/api/calibration";
import type { CorridorCalibration } from "@/lib/api/calibration";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FLOOR_PLAN_SRC = "/floorplans/floorplan_transparent.png";
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
  points,
  onClickPt,
  label,
  hint,
}: {
  src: string;
  isVideo: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  points: XY[];
  onClickPt: (pt: XY) => void;
  label: string;
  hint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (points.length >= 4) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onClickPt([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    },
    [points.length, onClickPt],
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <div
        ref={containerRef}
        onClick={handleClick}
        className={`relative aspect-video w-full overflow-hidden rounded-xl border border-white/[0.1] bg-black ${
          points.length < 4 ? "cursor-crosshair" : "cursor-default"
        }`}
      >
        {isVideo ? (
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            src={src}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            loop
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Floor plan" className="h-full w-full object-cover" />
        )}

        {/* Point markers */}
        {points.map((pt, i) => (
          <PointMarker key={i} idx={i} x={pt[0]} y={pt[1]} />
        ))}

        {/* Polygon line connecting points */}
        {points.length >= 2 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={[...points, points[0]]
                .slice(0, points.length + (points.length === 4 ? 1 : 0))
                .map((p) => `${p[0]}%,${p[1]}%`)
                .join(" ")}
              fill={points.length === 4 ? "rgba(255,255,255,0.07)" : "none"}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.8"
              strokeDasharray={points.length < 4 ? "4 3" : "none"}
            />
          </svg>
        )}

        {/* Overlay hint */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
          <p className="text-[10px] text-white/60">{hint}</p>
        </div>
      </div>
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

  const step =
    !selectedCam ? 0 : cameraPts.length < 4 ? 1 : floorPts.length < 4 ? 2 : 3;

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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div
        className="relative z-10 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgba(6,8,14,0.97)] shadow-2xl"
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {isEditMode ? "Edit corridor calibration" : "Corridor calibration"}
            </h2>
            <p className="mt-0.5 text-xs text-white/45">
              Mark 4 matching corners in the camera view and on the floor plan to compute the homography.
              {isEditMode
                ? " Use Clear to re-place corners, then click again in order A→D."
                : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.1]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 0: Pick camera */}
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Step 1 · Select camera
            </p>
            {isEditMode && initialCalibration ? (
              <div className="space-y-2">
                {selectedCam ? (
                  <p className="text-xs text-white/55">
                    Editing clip{" "}
                    <span className="font-medium text-white/85">
                      {selectedCam.path.split("/").pop() ?? selectedCam.path}
                    </span>{" "}
                    <span className="text-white/35">({initialCalibration.camera_id})</span>
                  </p>
                ) : (
                  <p className="rounded-lg border border-amber-400/25 bg-amber-950/25 px-3 py-2 text-xs text-amber-100/85">
                    No video in the bucket matches camera ID{" "}
                    <code className="rounded bg-black/40 px-1 py-0.5">{initialCalibration.camera_id}</code>.
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
                          ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
                          : "border-white/12 bg-white/[0.04] text-white/60 hover:border-white/20 hover:text-white/80"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
                {videoObjects.length === 0 && (
                  <p className="text-xs text-white/35">No videos in cam bucket yet.</p>
                )}
              </div>
            )}
          </div>

          {selectedCam && (
            <>
              {/* Step 1 + 2: Click points */}
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  Step 2 · Mark corridor corners (4 points each)
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={clearCameraCorners}
                    className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/75"
                  >
                    Clear camera corners
                  </button>
                  <button
                    type="button"
                    onClick={clearFloorCorners}
                    disabled={cameraPts.length < 4}
                    className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Clear floor corners
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ClickablePanel
                    src={selectedCam.url}
                    isVideo={selectedCam.kind === "video"}
                    videoRef={videoRef}
                    points={cameraPts}
                    onClickPt={(pt) => {
                      if (cameraPts.length < 4) setCameraPts((p) => [...p, pt]);
                    }}
                    label="Camera view — click the 4 floor-corners of the corridor"
                    hint={
                      cameraPts.length < 4
                        ? `Click corner ${POINT_LABELS[cameraPts.length]} (${4 - cameraPts.length} remaining)`
                        : "✓ 4 points set"
                    }
                  />
                  <ClickablePanel
                    src={FLOOR_PLAN_SRC}
                    isVideo={false}
                    points={floorPts}
                    onClickPt={(pt) => {
                      if (cameraPts.length === 4 && floorPts.length < 4)
                        setFloorPts((p) => [...p, pt]);
                    }}
                    label="Floor plan — click the same 4 corners in matching order"
                    hint={
                      cameraPts.length < 4
                        ? "Finish camera points first"
                        : floorPts.length < 4
                          ? `Click corner ${POINT_LABELS[floorPts.length]} (${4 - floorPts.length} remaining)`
                          : "✓ 4 points set"
                    }
                  />
                </div>
              </div>

              {/* Step 3: Label + save */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-[11px] font-medium text-white/45">
                    Corridor label (optional)
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={`e.g. "North corridor"`}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder-white/25 outline-none focus:border-white/25"
                  />
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/55 hover:bg-white/[0.08]"
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
                  className="rounded-full border border-sky-400/30 bg-sky-500/20 px-5 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/30 disabled:opacity-40"
                >
                  {saving ? "Saving…" : isEditMode ? "Save changes" : "Save calibration"}
                </button>
              </div>

              {error && (
                <p className="mt-3 rounded-lg border border-red-400/20 bg-red-950/30 px-3 py-2 text-xs text-red-200/80">
                  {error}
                </p>
              )}

              {/* Progress indicator */}
              <div className="mt-4 flex gap-2">
                {(["Camera selected", "Camera points (4)", "Floor points (4)", "Ready to save"] as const).map(
                  (s, i) => (
                    <div
                      key={s}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        i <= step
                          ? "bg-sky-400/15 text-sky-200/90"
                          : "bg-white/[0.04] text-white/30"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${i <= step ? "bg-sky-400" : "bg-white/20"}`}
                      />
                      {s}
                    </div>
                  ),
                )}
              </div>
            </>
          )}
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
        subtitle="Map camera view to floor plan corridor for accurate person heatmaps"
        action={
          <button
            type="button"
            onClick={() => {
              setEditingCalibration(null);
              setShowModal(true);
            }}
            className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-200/90 transition-colors hover:bg-sky-400/20"
          >
            + New calibration
          </button>
        }
      />

      <div className="mt-3 space-y-2">
        {listError ? (
          <p className="rounded-xl border border-amber-400/25 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
            {listError}
          </p>
        ) : null}
        {loadingCals ? (
          <p className="text-xs text-white/35">Loading…</p>
        ) : calibrations.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-5 text-center">
            <p className="text-sm font-medium text-white/50">No calibrations yet</p>
            <p className="mt-1 text-xs text-white/30">
              Click <span className="font-medium text-white/45">+ New calibration</span> to map a
              camera to its corridor on the floor plan.
            </p>
          </div>
        ) : (
          calibrations.map((cal) => (
            <div
              key={cal.camera_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white/80">
                  {cal.label || cal.camera_id}
                </p>
                <p className="mt-0.5 text-xs text-white/40">
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
                  className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold text-sky-200/90 transition-colors hover:bg-sky-400/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(cal.camera_id)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/40 hover:border-red-400/25 hover:text-red-300/70"
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
