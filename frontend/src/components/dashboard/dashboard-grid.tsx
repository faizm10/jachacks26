"use client";

import { ARLabelsOverlay, type StableTrack } from "@/components/panels/ar-labels-overlay";
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
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  /** Stable tracks from ARLabelsOverlay — used to map Gemini persons → stable IDs */
  const stableTracksRef = useRef<StableTrack[]>([]);

  const handleSelect = useCallback((obj: { url: string }) => {
    // Toggle: clicking the same feed deselects it
    setSelectedUrl((prev) => (prev === obj.url ? null : obj.url));
  }, []);

  // New clip → default AR / insights highlight to first stable track (P1), before paint (no stale Pn flash).
  useLayoutEffect(() => {
    if (selectedUrl) setHighlightPersonId("P1");
    else setHighlightPersonId(null);
  }, [selectedUrl]);

  const handlePersonInsightClick = useCallback((personId: string) => {
    const feed = document.getElementById("camera-feed");
    if (feed) {
      const r = feed.getBoundingClientRect();
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      const visiblePx = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      const needScroll = visiblePx < Math.min(120, Math.max(r.height * 0.15, 48));
      if (needScroll) {
        feed.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
    setHighlightPersonId((prev) => (prev === personId ? null : personId));
  }, []);

  const handleStableTracks = useCallback((tracks: StableTrack[]) => {
    stableTracksRef.current = tracks;
  }, []);

  // One vision pass per clip (looping video repeats the same file — no periodic re-analyze)
  const { status: analysisStatus, analysis } = useLiveAnalysis(selectedUrl);

  // Merge live analysis into the snapshot when available
  const liveStats = useMemo(() => {
    if (!analysis) {
      if (selectedUrl) {
        return {
          ...snapshot.stats,
          activePeople: 0,
          focalPoint: "Analyzing clip…",
        };
      }
      return snapshot.stats;
    }
    return {
      activePeople: analysis.peopleCount,
      dwellMinutes: snapshot.stats.dwellMinutes,
      focalPoint: analysis.activities[0] ?? snapshot.stats.focalPoint,
      ambientDb: snapshot.stats.ambientDb,
    };
  }, [analysis, selectedUrl, snapshot.stats]);


  const liveInsights = useMemo(() => {
    // With a feed selected but no analysis yet (loading, switched clip, error), show nothing — not mock snapshot rows.
    if (!analysis) return selectedUrl ? [] : snapshot.insights;
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
    analysis.persons.forEach((person, i) => {
      // Find the stable track that best matches this Gemini person by bbox IoU
      // so the insight row uses the same ID as the AR label badge
      let stableId = person.id;
      let bestIou = 0;
      for (const track of stableTracksRef.current) {
        const ix1 = Math.max(person.bbox.x, track.bbox.x);
        const iy1 = Math.max(person.bbox.y, track.bbox.y);
        const ix2 = Math.min(person.bbox.x + person.bbox.w, track.bbox.x + track.bbox.w);
        const iy2 = Math.min(person.bbox.y + person.bbox.h, track.bbox.y + track.bbox.h);
        const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
        const union = person.bbox.w * person.bbox.h + track.bbox.w * track.bbox.h - inter;
        const iou = union > 0 ? inter / union : 0;
        if (iou > bestIou) {
          bestIou = iou;
          stableId = track.stableId;
        }
      }

      insights.push({
        id: `insight-person-${i}-${person.id}`,
        personId: stableId,
        title: `${stableId} — ${person.activity}`,
        detail: `Confidence ${Math.round(person.confidence * 100)}%`,
        timestamp: "Just now",
        severity: "calm" as const,
      });
    });
    return insights.length > 0 ? insights : snapshot.insights;
  }, [analysis, selectedUrl, snapshot.insights]);

  const behaviorHeatmapCells = useMemo(() => {
    if (analysis?.persons && analysis.persons.length > 0) {
      return buildActivityHeatmapFromPersons(analysis.persons);
    }
    if (selectedUrl) return [];
    return snapshot.heatmap;
  }, [analysis?.persons, selectedUrl, snapshot.heatmap]);

  const heatmapSubtitle =
    analysis?.persons && analysis.persons.length > 0
      ? "From one vision pass on this clip; brighter = more overlap where people were labeled in that frame"
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
            onStableTracks={handleStableTracks}
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
