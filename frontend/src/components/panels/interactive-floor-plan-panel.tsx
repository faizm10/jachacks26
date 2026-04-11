"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useActiveVideo } from "@/components/room-intel/active-video-context";
import { analyzeFloorplanFromVideo, FloorplanApiError } from "@/lib/api/floorplan";
import type { FloorPlanData } from "@/lib/types/room";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const PHASES = ["Downloading clip…", "Sampling motion…", "Mapping activity…"];

/** Served from `public/floorplans/` (copy of repo `floor_plans/floorplan_transparent.png`, 1536×1024). */
export const DEFAULT_FLOOR_PLAN_SRC = "/floorplans/floorplan_transparent.png";

export function InteractiveFloorPlanPanel({
  fallback,
  /** Raster or SVG under heat (not the camera frame). */
  basePlanSrc = DEFAULT_FLOOR_PLAN_SRC,
}: {
  fallback: FloorPlanData;
  basePlanSrc?: string;
}) {
  const { activeVideo } = useActiveVideo();
  const [data, setData] = useState<FloorPlanData>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const requestSeq = useRef(0);

  const analyzeUrl = useCallback(async (url: string, seq: number, clipPath?: string | null) => {
    setLoading(true);
    setError(null);
    const tick = window.setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, 850);
    const corridorMap =
      clipPath && /img[\s_-]*5530/i.test(clipPath.toLowerCase()) ? true : undefined;
    // Derive camera_id from filename — backend will look up corridor calibration if one exists
    const cameraId = clipPath
      ? (clipPath.split("/").pop()?.replace(/\.[^.]+$/, "")?.trim().toLowerCase() ?? undefined)
      : undefined;
    try {
      const next = await analyzeFloorplanFromVideo(url, { corridorMap, cameraId });
      if (requestSeq.current !== seq) return;
      setData(next);
    } catch (e) {
      if (requestSeq.current !== seq) return;
      setData(fallbackRef.current);
      const msg =
        e instanceof FloorplanApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not build motion map";
      setError(msg);
    } finally {
      clearInterval(tick);
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeVideo || activeVideo.kind !== "video") {
      requestSeq.current += 1;
      setData(fallbackRef.current);
      setError(null);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    void analyzeUrl(activeVideo.url, seq, activeVideo.path);
    // Key on url/path/kind only — full `activeVideo` identity churns without URL change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideo?.path, activeVideo?.url, activeVideo?.kind, analyzeUrl]);

  const subtitle = loading
    ? PHASES[phaseIdx]
    : error
      ? "Using demo layout — fix API to rebuild heat from a clip"
      : data.source === "video"
        ? "Heat overlay from clip motion on the floor plan (no zone boxes)"
        : "Schematic floor plan · pick a clip to layer motion heat on top";

  const fileHint = activeVideo?.path?.split("/").pop() ?? null;

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Floor plan + activity"
        subtitle={fileHint ? `${subtitle} · ${fileHint}` : subtitle}
        action={
          loading ? (
            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/90">
              Analyzing
            </span>
          ) : error ? (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100/90">
              Fallback
            </span>
          ) : data.source === "video" ? (
            <span
              className={
                data.meta?.mapping === "corridor_img5530"
                  ? "rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-100/90"
                  : "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90"
              }
            >
              {data.meta?.mapping === "corridor_img5530" ? "Corridor map" : "Live map"}
            </span>
          ) : (
            <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Demo
            </span>
          )
        }
      />

      <div className="relative mt-2 aspect-[3/2] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c0f14]">
        <AnimatePresence>
          {loading ? (
            <motion.div
              key="sk"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/45 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="h-9 w-9 rounded-full border-2 border-white/15 border-t-cyan-300/80"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-xs font-medium tracking-wide text-white/55">{PHASES[phaseIdx]}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <p className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-amber-400/20 bg-amber-950/40 px-3 py-2 text-[11px] leading-snug text-amber-100/85">
            {error}
          </p>
        ) : null}

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Floor plan with activity overlay"
        >
          <defs>
            <pattern id="fineGrid" width="6" height="6" patternUnits="userSpaceOnUse">
              <path
                d="M 6 0 L 0 0 0 6"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="0.08"
              />
            </pattern>
          </defs>

          <rect width="100" height="100" fill="#0c0f14" />
          <image
            href={basePlanSrc}
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid meet"
          />
          <rect width="100" height="100" fill="url(#fineGrid)" opacity={0.18} />
          <rect width="100" height="100" fill="rgba(0,0,0,0.06)" />

          {data.overlayDataUrl ? (
            // HOG+homography overlays are RGBA (transparent outside corridor) → use "normal"
            // Legacy frame-diff overlays are opaque RGB → use "screen" to blend with floor plan
            <image
              href={data.overlayDataUrl}
              width="100"
              height="100"
              preserveAspectRatio="xMidYMid meet"
              opacity={data.meta?.pipeline === "yolo_homography" ? 1 : 0.62}
              style={{
                mixBlendMode: data.meta?.pipeline === "yolo_homography" ? "normal" : "screen",
              }}
            />
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />

        {activeVideo?.kind === "video" && !loading ? (
          <button
            type="button"
            onClick={() => {
              const seq = ++requestSeq.current;
              void analyzeUrl(activeVideo.url, seq, activeVideo.path);
            }}
            className={cn(
              "absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-3 py-1.5",
              "text-[10px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-md",
              "pointer-events-auto transition-colors hover:bg-white/10 hover:text-white",
            )}
          >
            Re-run
          </button>
        ) : null}
      </div>
    </GlassPanel>
  );
}
