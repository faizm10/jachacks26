"use client";

import type { RoomInsight, RoomStats } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const severityRing: Record<string, string> = {
  calm: "border-cyan-400/25 bg-cyan-400/5",
  info: "border-white/15 bg-white/[0.04]",
  attention: "border-amber-400/30 bg-amber-400/5",
};

export function InsightsPanel({
  stats,
  insights,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
}) {
  return (
    <GlassPanel className="p-5">
      <SectionHeader title="Live insights" subtitle="Room intelligence summary" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active" value={String(stats.activePeople)} hint="people" />
        <Stat label="Dwell" value={`${stats.dwellMinutes}m`} hint="session" />
        <Stat label="Focus" value={stats.focalPoint} hint="hot zone" />
        <Stat label="Ambient" value={`${stats.ambientDb} dB`} hint="noise" />
      </div>
      <ul className="flex flex-col gap-2">
        {insights.map((insight, i) => (
          <motion.li
            key={insight.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "rounded-xl border px-4 py-3",
              severityRing[insight.severity] ?? severityRing.info,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium tracking-tight text-white">{insight.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{insight.detail}</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {insight.timestamp}
              </span>
            </div>
          </motion.li>
        ))}
      </ul>
    </GlassPanel>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white">{value}</p>
      <p className="text-[10px] text-white/35">{hint}</p>
    </div>
  );
}
