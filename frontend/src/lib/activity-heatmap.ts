import type { DetectedPerson, HeatmapCell } from "@/lib/types/room";
import {
  BUILDING_GRID_W,
  BUILDING_GRID_H,
  cameraToGrid,
  type CameraRegion,
} from "@/lib/camera-regions";

/**
 * Build a heatmap on the full building grid (BUILDING_GRID_W × BUILDING_GRID_H).
 *
 * When a CameraRegion is provided, person foot positions are perspective-transformed
 * into the camera's sub-region. Cells outside the region stay at 0.
 *
 * Without a region, falls back to legacy camera-space bbox overlap on a 12×8 grid.
 */
export function buildActivityHeatmapFromPersons(
  persons: DetectedPerson[],
  region?: CameraRegion | null,
): HeatmapCell[] {
  if (persons.length === 0) return [];

  const gridW = region ? BUILDING_GRID_W : 12;
  const gridH = region ? BUILDING_GRID_H : 8;

  const acc: number[][] = Array.from({ length: gridH }, () => Array(gridW).fill(0));
  const bestContrib: number[][] = Array.from({ length: gridH }, () => Array(gridW).fill(0));
  const bestActivity: (string | null)[][] = Array.from({ length: gridH }, () =>
    Array(gridW).fill(null),
  );

  if (region) {
    const r = region.region;
    const rMinX = r.x;
    const rMaxX = r.x + r.w - 1;
    const rMinY = r.y;
    const rMaxY = r.y + r.h - 1;

    for (const p of persons) {
      const weight = Math.max(0.05, Math.min(1, p.confidence));
      const footX = p.bbox.x + p.bbox.w / 2;
      const footY = p.bbox.y + p.bbox.h;
      // Use bbox height as additional depth cue — smaller person = further away
      const { gx, gy } = cameraToGrid(footX, footY, region, p.bbox.h);

      // Gaussian spread — clamped to region bounds
      const sigma = 1.5;
      const radius = Math.ceil(sigma * 2.5);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = Math.floor(gx) + dx;
          const cy = Math.floor(gy) + dy;
          // Only write inside the camera's region
          if (cx < rMinX || cx > rMaxX || cy < rMinY || cy > rMaxY) continue;
          if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) continue;
          const dist2 = (gx - cx) * (gx - cx) + (gy - cy) * (gy - cy);
          const gaussian = Math.exp(-dist2 / (2 * sigma * sigma));
          const score = gaussian * weight;
          acc[cy][cx] += score;
          if (score > bestContrib[cy][cx]) {
            bestContrib[cy][cx] = score;
            bestActivity[cy][cx] = p.activity;
          }
        }
      }
    }
  } else {
    // Legacy raw camera-space
    for (const p of persons) {
      const { x: bx, y: by, w: bw, h: bh } = p.bbox;
      const weight = Math.max(0.05, Math.min(1, p.confidence));
      for (let gy = 0; gy < gridH; gy++) {
        const y0 = gy / gridH;
        const y1 = (gy + 1) / gridH;
        for (let gx = 0; gx < gridW; gx++) {
          const x0 = gx / gridW;
          const x1 = (gx + 1) / gridW;
          const ix0 = Math.max(x0, bx);
          const ix1 = Math.min(x1, bx + bw);
          const iy0 = Math.max(y0, by);
          const iy1 = Math.min(y1, by + bh);
          if (ix1 <= ix0 || iy1 <= iy0) continue;
          const inter = (ix1 - ix0) * (iy1 - iy0);
          const cellArea = (1 / gridW) * (1 / gridH);
          const score = (cellArea > 0 ? inter / cellArea : 0) * weight;
          acc[gy][gx] += score;
          if (score > bestContrib[gy][gx]) {
            bestContrib[gy][gx] = score;
            bestActivity[gy][gx] = p.activity;
          }
        }
      }
    }
  }

  // Normalize
  let peak = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      peak = Math.max(peak, acc[gy][gx]);
    }
  }

  const cells: HeatmapCell[] = [];
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const intensity = peak > 0 ? Math.min(1, acc[gy][gx] / peak) : 0;
      const act = bestActivity[gy][gx];
      cells.push({
        x: gx,
        y: gy,
        intensity,
        dominantActivity: act && intensity > 0.02 ? act : undefined,
      });
    }
  }
  return cells;
}

/** Activity label for the person nearest to the hottest cell. */
export function dominantActivityNearPeak(
  persons: DetectedPerson[],
  cells: HeatmapCell[],
): string | null {
  if (persons.length === 0 || cells.length === 0) return null;
  let peak = cells[0]!;
  for (const c of cells) {
    if (c.intensity > peak.intensity) peak = c;
  }
  if (peak.intensity <= 0) return null;

  const gridW = Math.max(...cells.map((c) => c.x)) + 1;
  const gridH = Math.max(...cells.map((c) => c.y)) + 1;
  const cx = (peak.x + 0.5) / gridW;
  const cy = (peak.y + 0.5) / gridH;

  let best = persons[0]!;
  let bestD = Infinity;
  for (const p of persons) {
    const px = p.bbox.x + p.bbox.w / 2;
    const py = p.bbox.y + p.bbox.h;
    const d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.activity;
}
