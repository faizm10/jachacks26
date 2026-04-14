"use client";

import type { RoomInsight, RoomStats } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const severityRing: Record<string, string> = {
  calm: "border-cyan-600/30 bg-cyan-500/10",
  info: "border-border bg-muted/50",
  attention: "border-amber-600/35 bg-amber-500/8",
};

export function InsightsPanel({
  stats,
  insights,
  selectedPersonId,
  onPersonInsightClick,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
  selectedPersonId?: string | null;
  onPersonInsightClick?: (personId: string) => void;
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
        {insights.map((insight, i) => {
          const clickable = Boolean(insight.personId && onPersonInsightClick);
          const isSelected = insight.personId != null && insight.personId === selectedPersonId;
          return (
          <motion.li
            key={insight.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "rounded-xl border px-4 py-3",
              severityRing[insight.severity] ?? severityRing.info,
              clickable && "cursor-pointer transition-colors hover:border-primary/30 hover:bg-muted/60",
              isSelected && "border-primary/40 bg-muted/70 ring-1 ring-primary/25",
            )}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => {
              if (insight.personId && onPersonInsightClick) onPersonInsightClick(insight.personId);
            }}
            onKeyDown={(e) => {
              if (!clickable || !insight.personId || !onPersonInsightClick) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPersonInsightClick(insight.personId);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium tracking-tight text-foreground">{insight.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {insight.timestamp}
              </span>
            </div>
          </motion.li>
          );
        })}
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
    <div className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
