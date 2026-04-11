"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";

export function CameraFeedPanel() {
  return (
    <GlassPanel className="relative overflow-hidden p-5 min-h-[220px] lg:min-h-[280px]">
      <SectionHeader
        title="Camera feed"
        subtitle="Live view · placeholder stream"
        action={
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
            Live
          </span>
        }
      />
      <div className="relative mt-1 aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 40% 45%, rgba(120,150,255,0.15), transparent 55%), radial-gradient(ellipse 50% 45% at 70% 60%, rgba(255,255,255,0.06), transparent 50%), linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.5))",
          }}
          animate={{ opacity: [0.88, 1, 0.88] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-medium tracking-wide text-white/35">
            Video pipeline connects here
          </p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
    </GlassPanel>
  );
}
