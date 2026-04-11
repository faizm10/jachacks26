import type {
  BehaviorLabel,
  FloorPlanData,
  HeatmapCell,
  RoomInsight,
  RoomStats,
} from "@/lib/types/room";

export const mockRoomStats: RoomStats = {
  activePeople: 2,
  dwellMinutes: 14,
  focalPoint: "Collaboration table",
  ambientDb: 38,
};

export const mockInsights: RoomInsight[] = [
  {
    id: "1",
    title: "Quiet focus window",
    detail: "Low movement near the window for the last 6 minutes.",
    timestamp: "Just now",
    severity: "calm",
  },
  {
    id: "2",
    title: "Pairing cluster",
    detail: "Two occupants stationary at the central table.",
    timestamp: "2m ago",
    severity: "info",
  },
  {
    id: "3",
    title: "Entry activity",
    detail: "Brief motion spike at the door — likely arrival.",
    timestamp: "8m ago",
    severity: "attention",
  },
];

export const mockFloorPlan: FloorPlanData = {
  roomName: "Studio A",
  width: 100,
  height: 100,
  zones: [
    { id: "z1", label: "Table", x: 32, y: 28, w: 36, h: 28, occupancy: 0.72 },
    { id: "z2", label: "Window", x: 8, y: 18, w: 22, h: 48, occupancy: 0.22 },
    { id: "z3", label: "Door", x: 78, y: 62, w: 14, h: 22, occupancy: 0.41 },
    { id: "z4", label: "Screen wall", x: 12, y: 72, w: 52, h: 18, occupancy: 0.15 },
  ],
};

export const mockBehaviorLabels: BehaviorLabel[] = [
  { id: "l1", text: "Seated", confidence: 0.94, xPercent: 48, yPercent: 42 },
  { id: "l2", text: "Facing display", confidence: 0.81, xPercent: 52, yPercent: 38 },
  { id: "l3", text: "Standing", confidence: 0.67, xPercent: 82, yPercent: 68 },
];

function buildHeatmap(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 8; y++) {
      const cx = x - 5.5;
      const cy = y - 3.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const ripple = 0.18 * Math.sin(x * 0.7) * Math.cos(y * 0.5);
      const intensity = Math.max(0, Math.min(1, (1 - dist / 6.2) * 0.85 + ripple));
      cells.push({ x, y, intensity });
    }
  }
  return cells;
}

export const mockHeatmap: HeatmapCell[] = buildHeatmap();
