"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { ArLabelColorLegend } from "@/components/panels/ar-label-color-legend";
import { BuildingVibePanel } from "@/components/panels/building-vibe-panel";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { FloorOverviewPanel } from "@/components/panels/floor-overview-panel";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import {
  buildActivityHeatmapFromPersons,
  dominantActivityNearPeak,
} from "@/lib/activity-heatmap";
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
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(null);

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
      setHighlightPersonId(null);
    },
    [],
  );

  const handlePersonInsightClick = useCallback((personId: string) => {
    document
      .getElementById("camera-feed")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPersonId((prev) => (prev === personId ? null : personId));
  }, []);

  const { status: analysisStatus, analysis } = useLiveAnalysis(selectedUrl, {
    realtimeFrameCaptureMs: 3200,
  });

  const liveStats = useMemo(() => {
    if (!analysis) return snapshot.stats;
    return {
      activePeople: analysis.peopleCount,
      dwellMinutes: snapshot.stats.dwellMinutes,
      focalPoint: analysis.activities[0] ?? snapshot.stats.focalPoint,
      ambientDb: snapshot.stats.ambientDb,
    };
  }, [analysis, snapshot.stats]);

  const liveInsights = useMemo(() => {
    if (!analysis) return snapshot.insights;
    const insights = [];
    if (analysis.sceneDescription) {
      insights.push({
        id: "scene",
        title: "Scene overview",
        detail: analysis.sceneDescription,
        timestamp: "Just now",
        severity: "info" as const,
      });
    }
    for (const person of analysis.persons) {
      insights.push({
        id: `person-${person.id}`,
        personId: person.id,
        title: `Person ${person.id} — ${person.activity}`,
        detail: `Confidence ${Math.round(person.confidence * 100)}%`,
        timestamp: "Just now",
        severity: "calm" as const,
      });
    }
    return insights.length > 0 ? insights : snapshot.insights;
  }, [analysis, snapshot.insights]);

  const cameraRegion = useMemo(
    () => (selectedCameraId ? getCameraRegion(selectedCameraId) : null),
    [selectedCameraId],
  );

  const behaviorHeatmapCells = useMemo(() => {
    if (analysis?.persons && analysis.persons.length > 0) {
      return buildActivityHeatmapFromPersons(analysis.persons, cameraRegion);
    }
    return snapshot.heatmap;
  }, [analysis?.persons, snapshot.heatmap, cameraRegion]);

  const heatmapSubtitle =
    analysis?.persons && analysis.persons.length > 0
      ? cameraRegion
        ? `${cameraRegion.label} — perspective-corrected`
        : "AI labels — camera-space"
      : "Select a feed to see activity";

  const heatmapPeakCaption = useMemo(() => {
    if (!analysis?.persons?.length) return null;
    return dominantActivityNearPeak(analysis.persons, behaviorHeatmapCells);
  }, [analysis?.persons, behaviorHeatmapCells]);

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
          <FloorOverviewPanel
            cells={behaviorHeatmapCells}
            heatmapSubtitle={heatmapSubtitle}
            peakCaption={heatmapPeakCaption}
            cameraRegion={cameraRegion}
            activeFloorHint={selectedCameraId}
          />
        </motion.div>
        <motion.div variants={block} className="lg:col-span-5">
          <BuildingVibePanel stats={liveStats} insights={liveInsights} />
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
            detectionOverlay={
              selectedUrl ? (
                <ARLabelsOverlay
                  videoUrl={selectedUrl}
                  persons={analysis?.persons ?? []}
                  analyzing={analysisStatus === "analyzing"}
                  liveSceneSummary={analysis?.sceneDescription}
                  highlightedPersonId={highlightPersonId}
                  inline
                />
              ) : null
            }
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
