"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { HeatmapPanel } from "@/components/panels/heatmap-panel";
import { InsightsPanel } from "@/components/panels/insights-panel";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import {
  buildActivityHeatmapFromPersons,
  dominantActivityNearPeak,
} from "@/lib/activity-heatmap";
import type { RoomSnapshot } from "@/lib/types/room";
import { motion } from "framer-motion";
import Link from "next/link";
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
  // User-selected feed — analysis only runs when they pick one
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  /** Live insights person row → highlight matching bbox on AR / camera area. */
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(null);

  const handleSelect = useCallback(
    (obj: { url: string }) => {
      // Toggle: clicking the same feed deselects it
      setSelectedUrl((prev) => (prev === obj.url ? null : obj.url));
      setHighlightPersonId(null);
    },
    [],
  );

  const handlePersonInsightClick = useCallback((personId: string) => {
    document.getElementById("camera-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPersonId((prev) => (prev === personId ? null : personId));
  }, []);

  // Only analyze the explicitly selected feed
  const { status: analysisStatus, analysis } = useLiveAnalysis(selectedUrl, {
    realtimeFrameCaptureMs: 3200,
  });

  // Merge live analysis into the snapshot when available
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

  const behaviorHeatmapCells = useMemo(() => {
    if (analysis?.persons && analysis.persons.length > 0) {
      return buildActivityHeatmapFromPersons(analysis.persons);
    }
    return snapshot.heatmap;
  }, [analysis?.persons, snapshot.heatmap]);

  const heatmapSubtitle =
    analysis?.persons && analysis.persons.length > 0
      ? "From AI labels — refreshes while you watch (~every 3s); brighter = more overlap in the current frame"
      : "Aggregated movement density (demo)";

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
      <motion.div variants={block} id="camera-feed" className="scroll-mt-24">
        <CameraFeedPanel selectedUrl={selectedUrl} onSelect={handleSelect} />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12">
        <motion.div variants={block} className="space-y-6 lg:col-span-7">
          <ARLabelsOverlay
            videoUrl={selectedUrl}
            persons={analysis?.persons ?? []}
            analyzing={analysisStatus === "analyzing"}
            liveSceneSummary={analysis?.sceneDescription}
            highlightedPersonId={highlightPersonId}
          />
          <HeatmapPanel
            cells={behaviorHeatmapCells}
            subtitle={heatmapSubtitle}
            peakCaption={analysis?.persons?.length ? heatmapPeakCaption : null}
          />
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
          <InsightsPanel
            stats={liveStats}
            insights={liveInsights}
            selectedPersonId={highlightPersonId}
            onPersonInsightClick={handlePersonInsightClick}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
