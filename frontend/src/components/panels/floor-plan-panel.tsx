"use client";

import type { FloorPlanData } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";

export function FloorPlanPanel({ data }: { data: FloorPlanData }) {
  return (
    <GlassPanel className="p-5">
      <SectionHeader title="Floor plan" subtitle={data.roomName} />
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/80 bg-gradient-to-b from-card/90 to-muted/50">
        <div className="absolute inset-4 rounded-lg border border-dashed border-border/90" />
        {data.zones.map((z, i) => (
          <motion.div
            key={z.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.06 * i, type: "spring", stiffness: 320, damping: 24 }}
            className="absolute rounded-lg border border-border/90 bg-card/80 backdrop-blur-sm"
            style={{
              left: `${z.x}%`,
              top: `${z.y}%`,
              width: `${z.w}%`,
              height: `${z.h}%`,
              boxShadow: `inset 0 0 0 1px rgba(62,48,40,${0.06 + z.occupancy * 0.12})`,
            }}
          >
            <span className="absolute left-2 top-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {z.label}
            </span>
            <div className="absolute bottom-2 right-2 rounded-md bg-stone-900/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-stone-100">
              {Math.round(z.occupancy * 100)}% use
            </div>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}
