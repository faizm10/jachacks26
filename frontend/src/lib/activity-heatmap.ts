import type { DetectedPerson, HeatmapCell } from "@/lib/types/room";

const DEFAULT_GRID_W = 12;
const DEFAULT_GRID_H = 8;

/**
 * Builds a coarse grid heatmap from AI person boxes: each cell gets intensity
 * proportional to how much of that cell overlaps each person's bbox, times confidence.
 * Normalized so the hottest cell is 1 — shows "where in the frame" behavior is concentrated.
 */
export function buildActivityHeatmapFromPersons(
  persons: DetectedPerson[],
  gridW = DEFAULT_GRID_W,
  gridH = DEFAULT_GRID_H,
): HeatmapCell[] {
  if (persons.length === 0) return [];

  const acc: number[][] = Array.from({ length: gridH }, () => Array(gridW).fill(0));
  const bestContrib: number[][] = Array.from({ length: gridH }, () => Array(gridW).fill(0));
  const bestActivity: (string | null)[][] = Array.from({ length: gridH }, () =>
    Array(gridW).fill(null),
  );

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
        const fracOfCell = cellArea > 0 ? inter / cellArea : 0;
        const score = fracOfCell * weight;
        acc[gy][gx] += score;
        if (score > bestContrib[gy][gx]) {
          bestContrib[gy][gx] = score;
          bestActivity[gy][gx] = p.activity;
        }
      }
    }
  }

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

/** Activity label for the person whose bbox center is closest to the hottest grid cell. */
export function dominantActivityNearPeak(
  persons: DetectedPerson[],
  cells: HeatmapCell[],
  gridW = DEFAULT_GRID_W,
  gridH = DEFAULT_GRID_H,
): string | null {
  if (persons.length === 0 || cells.length === 0) return null;
  let peak = cells[0]!;
  for (const c of cells) {
    if (c.intensity > peak.intensity) peak = c;
  }
  if (peak.intensity <= 0) return null;

  const cx = (peak.x + 0.5) / gridW;
  const cy = (peak.y + 0.5) / gridH;
  let best: DetectedPerson = persons[0]!;
  let bestD = Infinity;
  for (const p of persons) {
    const px = p.bbox.x + p.bbox.w / 2;
    const py = p.bbox.y + p.bbox.h / 2;
    const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.activity;
}
