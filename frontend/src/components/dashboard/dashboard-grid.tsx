"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { FloorPlanPanel } from "@/components/panels/floor-plan-panel";
import { HeatmapPanel } from "@/components/panels/heatmap-panel";
import { InsightsPanel } from "@/components/panels/insights-panel";
import type { RoomSnapshot } from "@/lib/types/room";
import { motion } from "framer-motion";

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
          <div id="floor-plan" className="scroll-mt-24">
            <FloorPlanPanel data={snapshot.floorPlan} />
          </div>
          <InsightsPanel stats={snapshot.stats} insights={snapshot.insights} />
        </motion.div>
      </div>
    </motion.div>
  );
}
