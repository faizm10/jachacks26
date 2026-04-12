"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useActiveVideo } from "@/components/room-intel/active-video-context";
import { analyzeFloorplanFromVideo, FloorplanApiError } from "@/lib/api/floorplan";
import type { FloorPlanData } from "@/lib/types/room";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const PHASES = ["Downloading clip…", "Sampling motion…", "Mapping activity…"];

/** Served from `public/floorplans/` (copy of repo `floor_plans/floorplan_transparent.png`, 1536×1024). */
export const DEFAULT_FLOOR_PLAN_SRC = "/floorplans/floorplan_transparent.png";

function MotionHeatSchematicPreview({
  basePlanSrc,
  overlayDataUrl,
  pipeline,
  patternId,
}: {
  basePlanSrc: string;
  overlayDataUrl: string;
  pipeline?: string;
  patternId: string;
}) {
  const isHomography = pipeline === "yolo_homography";
  return (
    <div className="relative aspect-[3/2] max-h-[min(40vh,280px)] w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0f14]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Motion heat on schematic floor plan"
      >
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse">
            <path
              d="M 6 0 L 0 0 0 6"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.08"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="#0c0f14" />
        <image href={basePlanSrc} width="100" height="100" preserveAspectRatio="xMidYMid meet" />
        <rect width="100" height="100" fill={`url(#${patternId})`} opacity={0.18} />
        <rect width="100" height="100" fill="rgba(0,0,0,0.06)" />
        <image
          href={overlayDataUrl}
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid meet"
          opacity={isHomography ? 1 : 0.62}
          style={{
            mixBlendMode: isHomography ? ("normal" as const) : ("screen" as const),
          }}
        />
      </svg>
    </div>
  );
}

export function InteractiveFloorPlanPanel({
  fallback,
  /** Raster under heat in the 2D motion preview only */
  basePlanSrc = DEFAULT_FLOOR_PLAN_SRC,
}: {
  fallback: FloorPlanData;
  basePlanSrc?: string;
}) {
  const heatPatternId = useId().replace(/:/g, "");
  const { activeVideo } = useActiveVideo();
  const [data, setData] = useState<FloorPlanData>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [showHeatOn3d, setShowHeatOn3d] = useState(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideo?.path, activeVideo?.url, activeVideo?.kind, analyzeUrl]);

  const subtitle = loading
    ? PHASES[phaseIdx]
    : error
      ? "3D library view active — API fallback for motion heat"
      : data.source === "video"
        ? "3D library + motion heat on the ground plane and in the schematic (from your clip)"
        : "Interactive 3D library — pick a clip to generate a motion heat overlay";

  const fileHint = activeVideo?.path?.split("/").pop() ?? null;

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="3D library + motion"
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

      <div className="relative mt-2 space-y-4">
        <AnimatePresence>
          {loading ? (
            <motion.div
              key="sk"
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 rounded-xl bg-black/50 backdrop-blur-sm"
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
          <p className="rounded-lg border border-amber-400/20 bg-amber-950/40 px-3 py-2 text-[11px] leading-snug text-amber-100/85">
            {error}
          </p>
        ) : null}

        <JohnAbbottLibraryFloorThree
          motionHeatOverlayUrl={
            !loading && showHeatOn3d && data.overlayDataUrl ? data.overlayDataUrl : null
          }
          cornerActions={
            activeVideo?.kind === "video" && !loading ? (
              <div className="flex flex-col items-end gap-1.5">
                {data.overlayDataUrl ? (
                  <button
                    type="button"
                    onClick={() => setShowHeatOn3d((v) => !v)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md transition-colors",
                      showHeatOn3d
                        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100/90 hover:bg-emerald-500/25"
                        : "border-white/15 bg-black/60 text-white/55 hover:bg-white/15 hover:text-white/80",
                    )}
                  >
                    {showHeatOn3d ? "3D heat on" : "3D heat off"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const seq = ++requestSeq.current;
                    void analyzeUrl(activeVideo.url, seq, activeVideo.path);
                  }}
                  className={cn(
                    "rounded-full border border-white/15 bg-black/60 px-3 py-1.5",
                    "text-[10px] font-semibold uppercase tracking-wider text-white/75 backdrop-blur-md",
                    "transition-colors hover:bg-white/15 hover:text-white",
                  )}
                >
                  Re-run
                </button>
              </div>
            ) : null
          }
        />

        {data.overlayDataUrl ? (
          <details
            className="group rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 open:border-emerald-400/20"
            open
          >
            <summary className="cursor-pointer list-none text-xs font-medium text-white/70 outline-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                Motion heat (2D schematic)
                <span className="text-[10px] font-normal text-white/40">
                  Same image is draped on the 3D ground slab (3D heat toggle) — extruded rooms are illustrative
                </span>
              </span>
            </summary>
            <div className="mt-3">
              <MotionHeatSchematicPreview
                basePlanSrc={basePlanSrc}
                overlayDataUrl={data.overlayDataUrl}
                pipeline={typeof data.meta?.pipeline === "string" ? data.meta.pipeline : undefined}
                patternId={`heat-${heatPatternId}`}
              />
            </div>
          </details>
        ) : null}
      </div>
    </GlassPanel>
  );
}
