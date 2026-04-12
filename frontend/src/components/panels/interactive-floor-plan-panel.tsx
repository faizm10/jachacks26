"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useActiveVideo } from "@/components/room-intel/active-video-context";
import { analyzeFloorplanFromVideo, FloorplanApiError } from "@/lib/api/floorplan";
import type { FloorPlanData } from "@/lib/types/room";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const PHASES = ["Downloading clip…", "Sampling motion…", "Mapping activity…"];

export function InteractiveFloorPlanPanel({ fallback }: { fallback: FloorPlanData }) {
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
        ? "3D library + motion heat on the ground plane (from your clip)"
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
      </div>
    </GlassPanel>
  );
}
