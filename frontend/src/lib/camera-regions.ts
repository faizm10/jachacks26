/**
 * Camera region presets — defines where each camera sees on the behavior heatmap.
 *
 * The heatmap is always a fixed BUILDING_GRID (30×30).
 * Each camera occupies a sub-rectangle within that grid, defined by `region`.
 * The camera's position determines the perspective warp direction.
 */

export type CameraPosition =
  | "left" | "right" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The full building heatmap grid size */
export const BUILDING_GRID_W = 30;
export const BUILDING_GRID_H = 30;

export interface CameraRegion {
  label: string;
  /** Sub-rectangle within the building grid { x, y, w, h } in grid cells */
  region: { x: number; y: number; w: number; h: number };
  /** Where the camera is positioned relative to the sub-region */
  cameraEdge: CameraPosition;
  /** Perspective strength 0–1. Higher = more fan-out near camera */
  perspective: number;
}

/** Helper: define only w, h and auto-center in the building grid */
function centered(
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.floor((BUILDING_GRID_W - w) / 2),
    y: Math.floor((BUILDING_GRID_H - h) / 2),
    w,
    h,
  };
}

export const CAMERA_REGIONS: Record<string, CameraRegion> = {
  "basement-hallway-1": {
    label: "Basement hallway (cam 1)",
    region: centered(28, 4),
    cameraEdge: "left",
    perspective: 0.6,
  },
  "basement-hallway-2": {
    label: "Basement hallway (cam 2)",
    region: centered(28, 4),
    cameraEdge: "left",
    perspective: 0.6,
  },
  "basement-hallway-3": {
    label: "Basement hallway (cam 3)",
    region: centered(28, 4),
    cameraEdge: "left",
    perspective: 0.6,
  },
  "first-floor-main-hall": {
    label: "Main hall",
    region: centered(16, 16),
    cameraEdge: "top-left",
    perspective: 0.5,
  },
  "hall-test": {
    label: "Main hall (test)",
    region: centered(16, 16),
    cameraEdge: "top-left",
    perspective: 0.5,
  },
  "first-floor-entrance": {
    label: "Entrance",
    region: centered(8, 12),
    cameraEdge: "bottom",
    perspective: 0.5,
  },
  "first-floor-study-area": {
    label: "Study area",
    region: centered(14, 8),
    cameraEdge: "bottom",
    perspective: 0.45,
  },
};

export function getCameraRegion(cameraId: string): CameraRegion | null {
  const key = cameraId.toLowerCase().replace(/\.[^.]+$/, "").trim();
  if (CAMERA_REGIONS[key]) return CAMERA_REGIONS[key];
  for (const [k, v] of Object.entries(CAMERA_REGIONS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/**
 * Transform a person's camera-space position into the BUILDING grid,
 * accounting for perspective from the camera's position.
 *
 * For corner cameras (e.g. top-left), depth runs diagonally and the
 * fan-out spreads in both axes.
 */
export function cameraToGrid(
  camX: number,
  camY: number,
  region: CameraRegion,
  bboxH?: number,
): { gx: number; gy: number } {
  // Depth cues
  const depthFromY = 1 - camY;
  const depthFromSize = bboxH != null
    ? Math.min(1, Math.max(0, 1 - bboxH / 0.5))
    : depthFromY;
  const depthRaw = bboxH != null
    ? depthFromY * 0.3 + depthFromSize * 0.7
    : depthFromY;
  const depth = Math.pow(depthRaw, 0.7);

  const p = region.perspective;
  const spread = 1 - p * depth;
  const horiz = 0.5 + (camX - 0.5) * spread;

  const r = region.region;

  switch (region.cameraEdge) {
    case "left":
      return { gx: r.x + depth * r.w, gy: r.y + horiz * r.h };
    case "right":
      return { gx: r.x + (1 - depth) * r.w, gy: r.y + horiz * r.h };
    case "top":
      return { gx: r.x + horiz * r.w, gy: r.y + depth * r.h };
    case "bottom":
      return { gx: r.x + horiz * r.w, gy: r.y + (1 - depth) * r.h };

    case "top-left": {
      // Camera at top-left corner, shooting toward bottom-right
      // Depth runs diagonally; horiz sweeps across the perpendicular
      // camX: 0=left edge of view, 1=right edge
      // Near camera: top-left corner. Far: bottom-right area.
      const diagX = depth;           // 0 = top-left, 1 = bottom-right
      const diagY = depth;
      // Spread the perpendicular axis (horiz) with perspective
      const perpX = (horiz - 0.5) * spread;
      const perpY = -(horiz - 0.5) * spread; // perpendicular to diagonal
      return {
        gx: r.x + (diagX + perpX) * r.w,
        gy: r.y + (diagY + perpY) * r.h,
      };
    }
    case "top-right": {
      const diagX = 1 - depth;
      const diagY = depth;
      const perpX = -(horiz - 0.5) * spread;
      const perpY = -(horiz - 0.5) * spread;
      return {
        gx: r.x + (diagX + perpX) * r.w,
        gy: r.y + (diagY + perpY) * r.h,
      };
    }
    case "bottom-left": {
      const diagX = depth;
      const diagY = 1 - depth;
      const perpX = (horiz - 0.5) * spread;
      const perpY = (horiz - 0.5) * spread;
      return {
        gx: r.x + (diagX + perpX) * r.w,
        gy: r.y + (diagY + perpY) * r.h,
      };
    }
    case "bottom-right": {
      const diagX = 1 - depth;
      const diagY = 1 - depth;
      const perpX = -(horiz - 0.5) * spread;
      const perpY = (horiz - 0.5) * spread;
      return {
        gx: r.x + (diagX + perpX) * r.w,
        gy: r.y + (diagY + perpY) * r.h,
      };
    }
  }
}
