"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { HeatmapPanel } from "@/components/panels/heatmap-panel";
import type { HeatmapCell } from "@/lib/types/room";
import type { CameraRegion } from "@/lib/camera-regions";
import { motion } from "framer-motion";
import { useState } from "react";

const FLOORS = [
  { id: "ground", label: "Ground floor", shortLabel: "G" },
  { id: "first", label: "First floor", shortLabel: "1F" },
  { id: "basement", label: "Basement", shortLabel: "B" },
] as const;

type FloorId = (typeof FLOORS)[number]["id"];

export function FloorOverviewPanel({
  cells,
  heatmapSubtitle,
  peakCaption,
  cameraRegion,
  activeFloorHint,
}: {
  cells: HeatmapCell[];
  heatmapSubtitle: string;
  peakCaption: string | null;
  cameraRegion: CameraRegion | null;
  /** Auto-select floor based on camera ID (e.g. "basement-hallway" → basement) */
  activeFloorHint: string | null;
}) {
  // Auto-select floor from camera hint
  const autoFloor: FloorId = activeFloorHint?.includes("basement")
    ? "basement"
    : activeFloorHint?.includes("first")
      ? "first"
      : "ground";

  const [selectedFloor, setSelectedFloor] = useState<FloorId>(autoFloor);

  // Update when camera changes
  if (activeFloorHint && autoFloor !== selectedFloor) {
    // Only auto-switch if user hasn't manually picked a different floor
  }

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Floor map"
        subtitle="Activity heatmap by floor"
        action={
          <div className="flex gap-1">
            {FLOORS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFloor(f.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  selectedFloor === f.id
                    ? "border border-emerald-400/30 bg-emerald-400/15 text-emerald-300"
                    : "border border-white/10 bg-white/[0.04] text-white/40 hover:text-white/60"
                }`}
              >
                {f.shortLabel}
              </button>
            ))}
          </div>
        }
      />

      {/* 2.5D perspective container */}
      <div className="mt-4" style={{ perspective: "800px" }}>
        <motion.div
          key={selectedFloor}
          initial={{ opacity: 0, rotateX: 8, y: 10 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Floor label */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-white/60">
              {FLOORS.find((f) => f.id === selectedFloor)?.label}
            </span>
            {cameraRegion && (
              <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2 py-0.5 text-[9px] font-semibold text-orange-300">
                {cameraRegion.label}
              </span>
            )}
          </div>

          {/* The heatmap for this floor */}
          <HeatmapPanel
            cells={cells}
            subtitle={heatmapSubtitle}
            peakCaption={peakCaption}
            cameraRegion={cameraRegion}
          />
        </motion.div>
      </div>

      {/* Stacked floor indicators */}
      <div className="mt-4 flex items-end gap-2">
        {FLOORS.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFloor(f.id)}
            className={`relative transition-all ${
              selectedFloor === f.id ? "z-10" : "z-0 opacity-50"
            }`}
          >
            <div
              className={`rounded-lg border px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                selectedFloor === f.id
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
                  : "border-white/10 bg-white/[0.04] text-white/30 hover:text-white/50"
              }`}
              style={{
                transform: `translateY(${(FLOORS.length - 1 - i) * -2}px)`,
              }}
            >
              {f.label}
            </div>
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
