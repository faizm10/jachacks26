"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import type { CorridorCalibration } from "@/lib/api/calibration";
import { useEffect, useRef } from "react";

/**
 * Renders a 2D floor plan with the camera's calibrated region highlighted
 * and a simple heatmap overlay based on the floor_pts polygon.
 */
export function CameraFloorMap({
  calibration,
  floorPlanSrc = "/floorplans/floorplan_transparent.png",
}: {
  calibration: CorridorCalibration | null;
  floorPlanSrc?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pulseRef = useRef(0);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = floorPlanSrc;
    img.onload = () => {
      imgRef.current = img;
    };
    return () => {
      img.onload = null;
    };
  }, [floorPlanSrc]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
          canvas.width = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
        }
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // Draw floor plan image
      if (imgRef.current) {
        const img = imgRef.current;
        const scale = Math.min(cw / img.width, ch / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        const ox = (cw - iw) / 2;
        const oy = (ch - ih) / 2;

        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, ox, oy, iw, ih);
        ctx.globalAlpha = 1;

        // Draw calibration overlay
        if (calibration) {
          pulseRef.current += 0.02;
          const pulse = 0.5 + 0.15 * Math.sin(pulseRef.current);

          const floorPts = calibration.floor_pts.map(([x, y]) => [
            ox + (x / 100) * iw,
            oy + (y / 100) * ih,
          ]);

          // Heatmap glow fill
          ctx.beginPath();
          ctx.moveTo(floorPts[0][0], floorPts[0][1]);
          for (let i = 1; i < floorPts.length; i++) {
            ctx.lineTo(floorPts[i][0], floorPts[i][1]);
          }
          ctx.closePath();

          // Gradient from center
          const cx2 = floorPts.reduce((s, p) => s + p[0], 0) / floorPts.length;
          const cy2 = floorPts.reduce((s, p) => s + p[1], 0) / floorPts.length;
          const maxDist = Math.max(
            ...floorPts.map((p) => Math.hypot(p[0] - cx2, p[1] - cy2)),
          );
          const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, maxDist * 1.2);
          grad.addColorStop(0, `rgba(251, 146, 60, ${(0.35 * pulse).toFixed(3)})`);
          grad.addColorStop(0.6, `rgba(251, 146, 60, ${(0.15 * pulse).toFixed(3)})`);
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fill();

          // Border
          ctx.beginPath();
          ctx.moveTo(floorPts[0][0], floorPts[0][1]);
          for (let i = 1; i < floorPts.length; i++) {
            ctx.lineTo(floorPts[i][0], floorPts[i][1]);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(251, 146, 60, ${(0.7 * pulse).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Corner dots
          for (const pt of floorPts) {
            ctx.fillStyle = "rgba(251, 146, 60, 0.9)";
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Label
          ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = "rgba(251, 146, 60, 0.85)";
          ctx.textAlign = "center";
          ctx.fillText(
            calibration.label.toUpperCase(),
            cx2,
            Math.min(...floorPts.map((p) => p[1])) - 10,
          );
          ctx.textAlign = "left";
        }
      } else {
        // No image yet — dark background
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(0, 0, cw, ch);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [calibration, floorPlanSrc]);

  const subtitle = calibration
    ? `Region: ${calibration.label} · floor plan overlay`
    : "No calibration — showing raw floor plan";

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Floor map — camera region"
        subtitle={subtitle}
        action={
          calibration ? (
            <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-200/90">
              Mapped
            </span>
          ) : null
        }
      />
      <div
        className="relative mt-2 w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/30"
        style={{ aspectRatio: "3 / 2" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
    </GlassPanel>
  );
}
