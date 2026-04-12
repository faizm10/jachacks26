"use client";

import { ArLabelColorLegend } from "@/components/panels/ar-label-color-legend";
import { BuildingVibePanel } from "@/components/panels/building-vibe-panel";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { FloorOverviewPanel } from "@/components/panels/floor-overview-panel";
import { getCameraRegion } from "@/lib/camera-regions";
import type { RoomSnapshot } from "@/lib/types/room";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

const block = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 28 },
  },
};

export function DashboardGrid({ snapshot }: { snapshot: RoomSnapshot }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  const handleSelect = useCallback(
    (obj: { url: string; path?: string }) => {
      setSelectedUrl((prev) => (prev === obj.url ? null : obj.url));
      const camId =
        obj.path
          ?.split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "")
          ?.trim()
          .toLowerCase() ?? null;
      setSelectedCameraId((prev) => (prev === camId ? null : camId));
    },
    [],
  );

  const cameraRegion = useMemo(
    () => (selectedCameraId ? getCameraRegion(selectedCameraId) : null),
    [selectedCameraId],
  );

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
      {/* ═══ HERO: Floor map + Building vibe ═══ */}
      <div className="grid gap-6 lg:grid-cols-12">
        <motion.div variants={block} className="lg:col-span-7">
          <FloorOverviewPanel cameraRegion={cameraRegion} />
        </motion.div>
        <motion.div variants={block} className="lg:col-span-5">
          <BuildingVibePanel stats={snapshot.stats} insights={snapshot.insights} />
        </motion.div>
      </div>

      {/* ═══ CAMERA FEEDS with inline detection overlay ═══ */}
      <motion.div variants={block} id="admin-section" className="scroll-mt-24">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
            Camera feeds & detection
          </span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12" id="camera-feed">
        {/* Color legend floated on the left */}
        <motion.div variants={block} className="lg:col-span-3">
          <div className="sticky top-24">
            <ArLabelColorLegend />
          </div>
        </motion.div>

        {/* Camera feeds with inline AR overlay on selected tile */}
        <motion.div variants={block} className="lg:col-span-9">
          <CameraFeedPanel
            selectedUrl={selectedUrl}
            onSelect={handleSelect}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
