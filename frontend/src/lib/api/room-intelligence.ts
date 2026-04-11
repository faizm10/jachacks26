import {
  mockBehaviorLabels,
  mockFloorPlan,
  mockHeatmap,
  mockInsights,
  mockRoomStats,
} from "@/data/mock-dashboard";
import type {
  BehaviorLabel,
  FloorPlanData,
  FrameAnalysis,
  HeatmapCell,
  RoomInsight,
  RoomSnapshot,
  RoomStats,
} from "@/lib/types/room";
import { apiFetch } from "./client";

/**
 * Attempt to fetch a frame analysis from the backend.
 * Returns null when the backend is unreachable so callers can fall back.
 */
export async function analyzeFrame(
  frameUrl: string,
): Promise<FrameAnalysis | null> {
  try {
    return await apiFetch<FrameAnalysis>("/analyze", {
      method: "POST",
      body: JSON.stringify({ frame_url: frameUrl }),
    });
  } catch {
    return null;
  }
}

/**
 * Convert a backend FrameAnalysis into the dashboard's RoomStats shape.
 */
function analysisToStats(analysis: FrameAnalysis): RoomStats {
  return {
    activePeople: analysis.peopleCount,
    dwellMinutes: 0, // not tracked yet
    focalPoint:
      analysis.activities[0] ?? "Unknown",
    ambientDb: 0, // not tracked yet
  };
}

/**
 * Convert a backend FrameAnalysis into BehaviorLabel[] for the AR overlay.
 */
function analysisToLabels(analysis: FrameAnalysis): BehaviorLabel[] {
  return analysis.persons.map((p) => ({
    id: p.id,
    text: p.activity,
    confidence: p.confidence,
    xPercent: (p.bbox.x + p.bbox.w / 2) * 100,
    yPercent: (p.bbox.y + p.bbox.h / 2) * 100,
  }));
}

/**
 * Convert a backend FrameAnalysis into RoomInsight[] for the insights panel.
 */
function analysisToInsights(analysis: FrameAnalysis): RoomInsight[] {
  const insights: RoomInsight[] = [];

  if (analysis.sceneDescription) {
    insights.push({
      id: "scene",
      title: "Scene overview",
      detail: analysis.sceneDescription,
      timestamp: "Just now",
      severity: "info",
    });
  }

  for (const person of analysis.persons) {
    insights.push({
      id: `person-${person.id}`,
      title: `Person detected — ${person.activity}`,
      detail: `Confidence ${Math.round(person.confidence * 100)}%`,
      timestamp: "Just now",
      severity: "calm",
    });
  }

  return insights;
}

/* ── Public API (same signatures as before, now with live fallback) ── */

export async function getRoomStats(): Promise<RoomStats> {
  return structuredClone(mockRoomStats);
}

export async function getRoomInsights(): Promise<RoomInsight[]> {
  return structuredClone(mockInsights);
}

export async function getFloorPlan(): Promise<FloorPlanData> {
  return structuredClone(mockFloorPlan);
}

export async function getBehaviorLabels(): Promise<BehaviorLabel[]> {
  return structuredClone(mockBehaviorLabels);
}

export async function getHeatmap(): Promise<HeatmapCell[]> {
  return structuredClone(mockHeatmap);
}

export async function getRoomSnapshot(): Promise<RoomSnapshot> {
  const [stats, insights, floorPlan, behaviorLabels, heatmap] =
    await Promise.all([
      getRoomStats(),
      getRoomInsights(),
      getFloorPlan(),
      getBehaviorLabels(),
      getHeatmap(),
    ]);
  return { stats, insights, floorPlan, behaviorLabels, heatmap };
}

/**
 * Fetch a full live snapshot: analyze the latest frame, then merge
 * AI results into the dashboard format. Falls back to mocks on failure.
 */
export async function getLiveSnapshot(
  latestFrameUrl: string | null,
): Promise<RoomSnapshot> {
  if (!latestFrameUrl) {
    return getRoomSnapshot();
  }

  const analysis = await analyzeFrame(latestFrameUrl);

  if (!analysis) {
    return getRoomSnapshot();
  }

  return {
    stats: analysisToStats(analysis),
    insights: analysisToInsights(analysis),
    floorPlan: await getFloorPlan(), // keep mock for now
    behaviorLabels: analysisToLabels(analysis),
    heatmap: await getHeatmap(), // keep mock for now
  };
}
