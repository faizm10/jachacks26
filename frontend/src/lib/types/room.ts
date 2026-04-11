export type InsightSeverity = "info" | "attention" | "calm";

export interface RoomInsight {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  severity: InsightSeverity;
}

export interface FloorPlanZone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  occupancy: number;
}

export interface FloorPlanData {
  roomName: string;
  width: number;
  height: number;
  zones: FloorPlanZone[];
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
