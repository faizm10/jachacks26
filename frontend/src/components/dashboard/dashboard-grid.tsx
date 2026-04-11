"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { HeatmapPanel } from "@/components/panels/heatmap-panel";
import { InsightsPanel } from "@/components/panels/insights-panel";
import type { RoomSnapshot } from "@/lib/types/room";
import { motion } from "framer-motion";
import Link from "next/link";

const block = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 28 },
  },
};

export function DashboardGrid({ snapshot }: { snapshot: RoomSnapshot }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
      }}
      className="mx-auto max-w-7xl space-y-6"
    >
      <motion.div variants={block} id="camera-feed" className="scroll-mt-24">
        <CameraFeedPanel />
      </motion.div>
      <div className="grid gap-6 lg:grid-cols-12">
        <motion.div variants={block} className="space-y-6 lg:col-span-7">
          <ARLabelsOverlay labels={snapshot.behaviorLabels} />
          <HeatmapPanel cells={snapshot.heatmap} />
        </motion.div>
        <motion.div variants={block} className="space-y-6 lg:col-span-5">
          <div id="spatial-map" className="scroll-mt-24">
            <Link
              href="/spatial-map"
              className="group flex flex-col rounded-2xl border border-white/[0.1] bg-white/[0.04] p-5 transition-colors hover:border-white/[0.14] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-white">
                    Spatial motion map
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">
                    Top-down floor plan canvas with motion heat and zones — clips stay off the map
                    unless you preview them.
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 text-sm font-medium text-white/45 transition-colors group-hover:text-white/80">
                  Open →
                </span>
              </div>
            </Link>
          </div>
          <InsightsPanel stats={snapshot.stats} insights={snapshot.insights} />
        </motion.div>
      </div>
    </motion.div>
  );
}
