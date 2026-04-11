"use client";

import { getActivityLabelTheme } from "@/lib/ar-label-activity-colors";
import type { HeatmapCell } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";

function parseRgb(rgb: string): [number, number, number] | null {
  const m = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function heatmapCellStyle(cell: HeatmapCell): CSSProperties {
  const base = 0.04 + cell.intensity * 0.28;
  if (!cell.dominantActivity) {
    return {
      backgroundColor: `rgba(255,255,255,${base})`,
      boxShadow:
        cell.intensity > 0.55
          ? `inset 0 0 12px rgba(180,210,255,${cell.intensity * 0.12})`
          : undefined,
    };
  }
  const theme = getActivityLabelTheme(cell.dominantActivity);
  const rgb = parseRgb(theme.accent);
  if (!rgb) {
    return { backgroundColor: `rgba(255,255,255,${base})` };
  }
  const [r, g, b] = rgb;
  const alpha = 0.1 + cell.intensity * 0.62;
  return {
    backgroundColor: `rgba(${r},${g},${b},${alpha})`,
    boxShadow:
      cell.intensity > 0.2
        ? `inset 0 0 14px rgba(${r},${g},${b},${0.15 + cell.intensity * 0.25})`
        : undefined,
  };
}

export function HeatmapPanel({
  cells,
  subtitle = "Aggregated movement density",
  peakCaption,
}: {
  cells: HeatmapCell[];
  /** Explains data source, e.g. AI frame vs historical aggregate. */
  subtitle?: string;
  /** e.g. dominant activity near the brightest cell (AI heatmap only). */
  peakCaption?: string | null;
}) {
  if (cells.length === 0) {
    return (
      <GlassPanel className="p-5">
        <SectionHeader title="Behavior heatmap" subtitle={subtitle} />
        <p className="mt-3 text-xs text-white/40">
          Select a feed and run analysis to see where detected people occupy space in the frame.
        </p>
      </GlassPanel>
    );
  }

  const maxX = Math.max(...cells.map((c) => c.x), 1);
  const maxY = Math.max(...cells.map((c) => c.y), 1);
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <GlassPanel className="p-5">
      <SectionHeader title="Behavior heatmap" subtitle={subtitle} />
      {cells.some((c) => c.dominantActivity) ? (
        <p className="mb-2 text-[10px] leading-snug text-white/38">
          Tile color follows the dominant activity there — same buckets as the AR label color key
          (pink locked-in, sky social, amber motion, violet phone, rose eating, green default).
        </p>
      ) : null}
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
              style={heatmapCellStyle(cell)}
            />
          ))}
        </div>
      </div>
      {peakCaption ? (
        <p className="mt-2 text-[11px] text-white/45">
          Strongest region aligns with: <span className="text-white/70">{peakCaption}</span>
        </p>
      ) : null}
    </GlassPanel>
  );
}
