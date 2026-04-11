"use client";

import type { HeatmapCell } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";

export function HeatmapPanel({ cells }: { cells: HeatmapCell[] }) {
  const maxX = Math.max(...cells.map((c) => c.x), 1);
  const maxY = Math.max(...cells.map((c) => c.y), 1);
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Behavior heatmap"
        subtitle="Aggregated movement density"
      />
      <div className="grid gap-1 rounded-xl border border-white/[0.06] bg-black/25 p-3">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${maxX + 1}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${maxY + 1}, minmax(0, 1fr))`,
          }}
        >
          {sorted.map((cell, i) => (
            <motion.div
              key={`${cell.x}-${cell.y}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.012 * i, duration: 0.35, ease: "easeOut" }}
              className="aspect-square rounded-md"
              style={{
                backgroundColor: `rgba(255,255,255,${0.04 + cell.intensity * 0.32})`,
                boxShadow:
                  cell.intensity > 0.55
                    ? `inset 0 0 12px rgba(180,210,255,${cell.intensity * 0.12})`
                    : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}
