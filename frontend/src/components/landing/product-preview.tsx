"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { motion } from "framer-motion";

export function ProductPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.15 }}
      className="mx-auto w-full max-w-4xl"
    >
      <GlassPanel className="overflow-hidden p-1 sm:p-2">
        <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-black/50">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>
            <span className="ml-2 text-[11px] font-medium tracking-wide text-white/35">
              room-intelligence · live session
            </span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[1.1fr_0.9fr] sm:p-5">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-white/[0.06] bg-black/35">
              <div
                className="absolute inset-0 opacity-90"
                style={{
                  background:
                    "radial-gradient(circle at 30% 40%, rgba(140,170,255,0.2), transparent 45%), radial-gradient(circle at 80% 55%, rgba(255,255,255,0.08), transparent 40%), linear-gradient(145deg, rgba(255,255,255,0.05), rgba(0,0,0,0.55))",
                }}
              />
              <motion.div
                className="absolute left-[42%] top-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                Seated · 94%
              </motion.div>
              <motion.div
                className="absolute right-[18%] top-[58%] rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-medium text-white/75 backdrop-blur-md"
                animate={{ opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
              >
                Entry motion
              </motion.div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-2 text-[10px] font-medium text-white/40">
                <span>Camera A</span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-200/90">
                  Live
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  Insights
                </p>
                <p className="mt-2 text-sm font-medium text-white/90">Quiet focus window</p>
                <p className="mt-1 text-xs leading-relaxed text-white/45">
                  Low movement near the window for the last few minutes.
                </p>
              </div>
              <div className="grid flex-1 grid-cols-6 gap-1 rounded-lg border border-white/[0.06] bg-black/25 p-2">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-sm bg-white/[0.04]"
                    style={{
                      opacity: 0.25 + (i % 5) * 0.12 + (i % 3) * 0.05,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}
