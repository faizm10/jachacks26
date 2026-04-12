"use client";

import { CameraMappingPanel } from "@/components/panels/camera-mapping-panel";
import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import { PointCloudFloorPlan } from "@/components/spatial-map/point-cloud-floor-plan";
import { useLiveFloorBars } from "@/hooks/use-live-floor-bars";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

const block = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 30 },
  },
};

type ViewMode = "mesh" | "pointCloud";

export function SpatialMapWorkspace() {
  const [view, setView] = useState<ViewMode>("mesh");
  const { bars, regions, cams, camsLoading, assignCamera, activeRegionId, setActiveRegionId, activeRoomIds } = useLiveFloorBars();

  // Build highlight room IDs for hover (amber glow)
  const highlightRoomIds = useMemo(() => {
    if (activeRoomIds.length === 0) return null;
    const region = regions.find((r) => r.id === activeRegionId);
    if (!region) return null;
    const prefix = region.floor === "f1" ? "1st floor" : "Basement";
    return activeRoomIds.map((id) => `${prefix} · ${id}`);
  }, [activeRoomIds, activeRegionId, regions]);

  // Build pulse room IDs for regions currently analyzing (yellow pulse)
  const pulseRoomIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of regions) {
      if (r.status === "analyzing") {
        const prefix = r.floor === "f1" ? "1st floor" : "Basement";
        for (const roomId of r.roomIds) ids.push(`${prefix} · ${roomId}`);
      }
    }
    return ids.length > 0 ? ids : null;
  }, [regions]);

  // Build glow room IDs for regions that just finished (green brim)
  const glowRoomIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of regions) {
      if (r.status === "done" && !r.hardcoded) {
        const prefix = r.floor === "f1" ? "1st floor" : "Basement";
        for (const roomId of r.roomIds) ids.push(`${prefix} · ${roomId}`);
      }
    }
    return ids.length > 0 ? ids : null;
  }, [regions]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Header ── */}
      <motion.div variants={block} initial="hidden" animate="show">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Spatial map
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Map camera footage to building regions. Select a camera for each zone — activity bars appear on the 3D model in real time.
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* ── 3D model ── */}
        <motion.div
          variants={block}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.05 }}
          className="lg:col-span-8"
        >
          <div className="mb-2 flex items-center gap-3">
            <div
              className="inline-flex rounded-md border border-white/5 bg-white/2 p-px"
              role="tablist"
              aria-label="Visualization mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "mesh"}
                onClick={() => setView("mesh")}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors",
                  view === "mesh"
                    ? "bg-white/8 text-white/70"
                    : "text-white/30 hover:bg-white/4 hover:text-white/50",
                )}
              >
                Solid 3D
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "pointCloud"}
                onClick={() => setView("pointCloud")}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors",
                  view === "pointCloud"
                    ? "bg-white/8 text-white/70"
                    : "text-white/30 hover:bg-white/4 hover:text-white/50",
                )}
              >
                Point scan
              </button>
            </div>
            {bars.length > 0 && (
              <span className="text-[10px] text-white/25">
                {bars.length} people mapped from video
              </span>
            )}
          </div>

          <div className="min-h-125 lg:min-h-150">
            {view === "mesh" ? (
              <JohnAbbottLibraryFloorThree
                layoutVariant="stackedEmbed"
                fillColumn
                className="min-h-125 lg:min-h-150"
                livePersons={bars}
                highlightRoomId={highlightRoomIds}
                pulseRoomIds={pulseRoomIds}
                glowRoomIds={glowRoomIds}
              />
            ) : (
              <PointCloudFloorPlan
                fillColumn
                className="min-h-125 lg:min-h-150"
              />
            )}
          </div>
        </motion.div>

        {/* ── Camera mapping sidebar ── */}
        <motion.div
          variants={block}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
          className="lg:col-span-4"
        >
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
            Camera → region mapping
          </h2>
          <CameraMappingPanel
            regions={regions}
            cams={cams}
            camsLoading={camsLoading}
            onAssign={assignCamera}
            activeRegionId={activeRegionId}
            onRegionClick={setActiveRegionId}
          />
        </motion.div>
      </div>
    </div>
  );
}
