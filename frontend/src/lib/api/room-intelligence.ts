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
  HeatmapCell,
  RoomInsight,
  RoomSnapshot,
  RoomStats,
} from "@/lib/types/room";

/**
 * Placeholder implementations. Swap internals to call `apiFetch` from `./client`
 * when the Python service is available.
 */
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

export async function getRoomStats(): Promise<RoomStats> {
  return structuredClone(mockRoomStats);
}

export async function getRoomSnapshot(): Promise<RoomSnapshot> {
  const [stats, insights, floorPlan, behaviorLabels, heatmap] = await Promise.all([
    getRoomStats(),
    getRoomInsights(),
    getFloorPlan(),
    getBehaviorLabels(),
    getHeatmap(),
  ]);
  return { stats, insights, floorPlan, behaviorLabels, heatmap };
}
