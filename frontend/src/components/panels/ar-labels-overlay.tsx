"use client";

import type { DetectedPerson } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion, AnimatePresence } from "framer-motion";

function DetectionBoxes({ persons }: { persons: DetectedPerson[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {persons.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.04 * i, type: "spring", stiffness: 400, damping: 28 }}
            className="absolute"
            style={{
              left: `${p.bbox.x * 100}%`,
              top: `${p.bbox.y * 100}%`,
              width: `${p.bbox.w * 100}%`,
              height: `${p.bbox.h * 100}%`,
            }}
          >
            {/* Bounding box */}
            <div className="absolute inset-0 rounded-sm border-2 border-emerald-400/70 shadow-[0_0_10px_rgba(52,211,153,0.25)]" />

            {/* Corner accents */}
            <div className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-emerald-400 rounded-tl-sm" />
            <div className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-emerald-400 rounded-tr-sm" />
            <div className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-emerald-400 rounded-bl-sm" />
            <div className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-emerald-400 rounded-br-sm" />

            {/* Activity label above the box */}
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
              style={{ bottom: "calc(100% + 6px)" }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-black/80 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 shadow-lg backdrop-blur-sm">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {p.activity}
                <span className="ml-0.5 text-emerald-400/60">
                  {Math.round(p.confidence * 100)}%
                </span>
              </span>
            </div>

            {/* Person index badge */}
            <div className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black shadow-md">
              {i + 1}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export interface ARLabelsOverlayProps {
  videoUrl: string | null;
  persons: DetectedPerson[];
  analyzing?: boolean;
}

export function ARLabelsOverlay({ videoUrl, persons, analyzing }: ARLabelsOverlayProps) {
  const hasVideo = !!videoUrl;
  const hasDetections = persons.length > 0;

  return (
    <GlassPanel className="relative overflow-hidden p-5">
      <SectionHeader
        title="AR labels"
        subtitle={
          hasDetections
            ? `${persons.length} detection${persons.length !== 1 ? "s" : ""} · live overlay`
            : hasVideo
              ? "Analyzing footage…"
              : "Select a feed to begin"
        }
        action={
          hasDetections ? (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
              {persons.length} people
            </span>
          ) : null
        }
      />

      <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/60">
        {hasVideo ? (
          <>
            {/* Same video as the selected feed, playing with overlay */}
            <video
              key={videoUrl}
              className="h-full w-full object-contain"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              loop
            />
            <DetectionBoxes persons={persons} />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="text-2xl text-white/15">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <p className="text-xs text-white/30">Select a camera feed to see detections</p>
          </div>
        )}

        {/* Analyzing spinner overlay */}
        {analyzing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2">
              <motion.div
                className="h-4 w-4 rounded-full border-2 border-white/20 border-t-emerald-400"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-xs text-white/60">Analyzing…</span>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
