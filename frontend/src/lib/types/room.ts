export type InsightSeverity = "info" | "attention" | "calm";

export interface RoomInsight {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  severity: InsightSeverity;
  /** When set, row maps to a detected person — used for click-to-highlight on the video. */
  personId?: string;
}

export interface FloorPlanZone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  occupancy: number;
  /** Relative motion score from video analysis (optional) */
  motionScore?: number;
}

export interface FloorPlanData {
  roomName: string;
  width: number;
  height: number;
  zones: FloorPlanZone[];
  /** mock | video — how this map was produced */
  source?: "mock" | "video";
  /** data:image/png;base64,... heat underlay from motion pipeline */
  overlayDataUrl?: string | null;
  meta?: Record<string, unknown>;
}

export interface BehaviorLabel {
  id: string;
  text: string;
  confidence: number;
  xPercent: number;
  yPercent: number;
}

export interface HeatmapCell {
  x: number;
  y: number;
  intensity: number;
  /** Activity driving this cell’s color (AI behavior heatmap only). */
  dominantActivity?: string;
}

export interface RoomStats {
  activePeople: number;
  dwellMinutes: number;
  focalPoint: string;
  ambientDb: number;
}

export interface RoomSnapshot {
  stats: RoomStats;
  insights: RoomInsight[];
  floorPlan: FloorPlanData;
  behaviorLabels: BehaviorLabel[];
  heatmap: HeatmapCell[];
}

/* ── Backend analysis types ── */

export interface DetectedPerson {
  id: string;
  /** Bounding box as fractions of image dimensions (0–1) */
  bbox: { x: number; y: number; w: number; h: number };
  /** Inferred activity, e.g. "sitting", "talking", "writing" */
  activity: string;
  confidence: number;
}

export interface FrameAnalysis {
  /** Number of people detected */
  peopleCount: number;
  /** Per-person detections */
  persons: DetectedPerson[];
  /** High-level scene description */
  sceneDescription: string;
  /** Overall activity labels for the room */
  activities: string[];
  /** ISO timestamp of when analysis ran */
  analyzedAt: string;
  /** URL of the frame that was analyzed */
  frameUrl: string;
}
