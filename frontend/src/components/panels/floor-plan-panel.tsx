"use client";

import type { FloorPlanData } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";

export function FloorPlanPanel({ data }: { data: FloorPlanData }) {
  return (
    <GlassPanel className="p-5">
      <SectionHeader title="Floor plan" subtitle={data.roomName} />
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-black/40">
        <div className="absolute inset-4 rounded-lg border border-dashed border-white/10" />
        {data.zones.map((z, i) => (
          <motion.div
            key={z.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.06 * i, type: "spring", stiffness: 320, damping: 24 }}
            className="absolute rounded-lg border border-white/15 bg-white/[0.06] backdrop-blur-sm"
            style={{
              left: `${z.x}%`,
              top: `${z.y}%`,
              width: `${z.w}%`,
              height: `${z.h}%`,
              boxShadow: `inset 0 0 0 1px rgba(255,255,255,${0.04 + z.occupancy * 0.08})`,
            }}
          >
            <span className="absolute left-2 top-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
              {z.label}
            </span>
            <div className="absolute bottom-2 right-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/60">
              {Math.round(z.occupancy * 100)}% use
            </div>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}
