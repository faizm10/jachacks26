"use client";

import { getActivityLabelTheme } from "@/lib/ar-label-activity-colors";
import type { CameraRegion } from "@/lib/camera-regions";
import type { HeatmapCell } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useEffect, useRef } from "react";

/* ── Color helpers ── */

function parseRgb(rgb: string): [number, number, number] {
  const m = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [255, 255, 255];
}

function cellTargetColor(cell: HeatmapCell): [number, number, number, number] {
  if (!cell.dominantActivity) {
    return [255, 255, 255, 0.04 + cell.intensity * 0.28];
  }
  const theme = getActivityLabelTheme(cell.dominantActivity);
  const [r, g, b] = parseRgb(theme.accent);
  return [r, g, b, 0.1 + cell.intensity * 0.7];
}

function lerpColor(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

/* ── Component ── */

export function HeatmapPanel({
  cells,
  subtitle = "Aggregated movement density",
  peakCaption,
  cameraRegion,
}: {
  cells: HeatmapCell[];
  subtitle?: string;
  peakCaption?: string | null;
  /** When set, draws a highlighted border around this camera's sub-region */
  cameraRegion?: CameraRegion | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentColors = useRef<Map<string, [number, number, number, number]>>(new Map());
  const rafRef = useRef<number | null>(null);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const regionRef = useRef(cameraRegion);
  regionRef.current = cameraRegion;

  const gridW = cells.length > 0 ? Math.max(...cells.map((c) => c.x)) + 1 : 12;
  const gridH = cells.length > 0 ? Math.max(...cells.map((c) => c.y)) + 1 : 8;

  useEffect(() => {
    if (cells.length === 0) return;

    const LERP = 0.08;
    const GAP = 1;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }

      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      const cellW = (cw - GAP * (gridW + 1)) / gridW;
      const cellH = (ch - GAP * (gridH + 1)) / gridH;
      const cur = currentColors.current;

      // Draw all cells
      for (const cell of cellsRef.current) {
        const key = `${cell.x}-${cell.y}`;
        const target = cellTargetColor(cell);
        const prev = cur.get(key) ?? [0, 0, 0, 0.04] as [number, number, number, number];
        const lerped = lerpColor(prev, target, LERP);
        cur.set(key, lerped);

        const x = GAP + cell.x * (cellW + GAP);
        const y = GAP + cell.y * (cellH + GAP);
        const [r, g, b, a] = lerped;

        ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 1.5);
        ctx.fill();

        // Glow for hot cells
        if (a > 0.35) {
          const glow = ctx.createRadialGradient(
            x + cellW / 2, y + cellH / 2, 0,
            x + cellW / 2, y + cellH / 2, Math.max(cellW, cellH) * 0.7,
          );
          glow.addColorStop(0, `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(a * 0.25).toFixed(3)})`);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(x, y, cellW, cellH);
        }
      }

      // Draw camera region border
      const region = regionRef.current;
      if (region) {
        const r = region.region;
        const rx = GAP + r.x * (cellW + GAP) - GAP / 2;
        const ry = GAP + r.y * (cellH + GAP) - GAP / 2;
        const rw = r.w * (cellW + GAP);
        const rh = r.h * (cellH + GAP);

        // Subtle fill tint inside region
        ctx.fillStyle = "rgba(56, 189, 248, 0.04)";
        ctx.fillRect(rx, ry, rw, rh);

        // Dashed border
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);

        // Corner accents (solid)
        const cornerLen = Math.min(rw, rh) * 0.15;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
        ctx.lineWidth = 2.5;
        // TL
        ctx.beginPath(); ctx.moveTo(rx, ry + cornerLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + cornerLen, ry); ctx.stroke();
        // TR
        ctx.beginPath(); ctx.moveTo(rx + rw - cornerLen, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cornerLen); ctx.stroke();
        // BL
        ctx.beginPath(); ctx.moveTo(rx, ry + rh - cornerLen); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cornerLen, ry + rh); ctx.stroke();
        // BR
        ctx.beginPath(); ctx.moveTo(rx + rw - cornerLen, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cornerLen); ctx.stroke();

        // Region label
        ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(56, 189, 248, 0.6)";
        ctx.textAlign = "left";
        ctx.fillText(region.label, rx + 4, ry - 4);

        // Camera position: orange dot with radial glow
        const edge = region.cameraEdge;
        let camPx = rx + rw / 2, camPy = ry + rh / 2;
        if (edge === "left") { camPx = rx; camPy = ry + rh / 2; }
        else if (edge === "right") { camPx = rx + rw; camPy = ry + rh / 2; }
        else if (edge === "top") { camPx = rx + rw / 2; camPy = ry; }
        else if (edge === "bottom") { camPx = rx + rw / 2; camPy = ry + rh; }
        else if (edge === "top-left") { camPx = rx; camPy = ry; }
        else if (edge === "top-right") { camPx = rx + rw; camPy = ry; }
        else if (edge === "bottom-left") { camPx = rx; camPy = ry + rh; }
        else if (edge === "bottom-right") { camPx = rx + rw; camPy = ry + rh; }

        // Radial glow
        const glowR = Math.min(rw, rh) * 0.35;
        const glow = ctx.createRadialGradient(camPx, camPy, 0, camPx, camPy, glowR);
        glow.addColorStop(0, "rgba(251, 146, 60, 0.45)");
        glow.addColorStop(0.5, "rgba(251, 146, 60, 0.12)");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.fillRect(camPx - glowR, camPy - glowR, glowR * 2, glowR * 2);

        // Outer ring
        ctx.strokeStyle = "rgba(251, 146, 60, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(camPx, camPy, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Filled dot
        ctx.fillStyle = "rgb(251, 146, 60)";
        ctx.shadowColor = "rgb(251, 146, 60)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(camPx, camPy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // "CAM" label
        ctx.font = "bold 7px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(251, 146, 60, 0.8)";
        ctx.textAlign = "center";
        ctx.fillText("CAM", camPx, camPy - 11);
        ctx.textAlign = "left";
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [cells.length, gridW, gridH]);

  useEffect(() => { currentColors.current.clear(); }, [gridW, gridH]);

  if (cells.length === 0) {
    return (
      <GlassPanel className="p-5">
        <SectionHeader title="Behavior heatmap" subtitle={subtitle} />
        <p className="mt-3 text-xs text-white/40">
          Select a feed and run analysis to see where detected people occupy space.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Behavior heatmap"
        subtitle={subtitle}
        action={
          <span className="text-[10px] font-medium text-white/30">
            {gridW}×{gridH}
          </span>
        }
      />
      <div
        className="relative mt-3 w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/30"
        style={{ aspectRatio: 1 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      {peakCaption ? (
        <p className="mt-2 text-[11px] text-white/45">
          Strongest region: <span className="text-white/70">{peakCaption}</span>
        </p>
      ) : null}
    </GlassPanel>
  );
}
