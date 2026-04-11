"use client";

import type { BehaviorLabel } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ARLabelsOverlay({ labels }: { labels: BehaviorLabel[] }) {
  return (
    <GlassPanel className="relative overflow-hidden p-5 min-h-[200px]">
      <SectionHeader
        title="AR labels"
        subtitle="Floating detections · mock overlay"
      />
      <div className="relative mt-2 aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-black/30">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        {labels.map((label, i) => (
          <motion.div
            key={label.id}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: 0.08 * i,
              type: "spring" as const,
              stiffness: 380,
              damping: 26,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${label.xPercent}%`, top: `${label.yPercent}%` }}
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5",
                "backdrop-blur-md shadow-lg",
              )}
            >
              <span className="text-[11px] font-medium tracking-tight text-white">
                {label.text}
              </span>
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/70">
                {Math.round(label.confidence * 100)}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}
