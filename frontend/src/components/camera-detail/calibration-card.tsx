"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import type { CorridorCalibration } from "@/lib/api/calibration";

function PointList({ label, points }: { label: string; points: [number, number][] }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {points.map((pt, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.08] text-[9px] font-bold text-white/50">
              {i + 1}
            </span>
            <span className="font-mono text-[11px] text-white/60">
              {pt[0].toFixed(1)}, {pt[1].toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniFloorPreview({ cal }: { cal: CorridorCalibration }) {
  const pad = 8;
  const size = 120;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-28 w-28 rounded-lg border border-white/[0.06] bg-black/30"
    >
      {/* Camera quad */}
      <polygon
        points={cal.camera_pts.map(([x, y]) => `${(x / 100) * size},${(y / 100) * size}`).join(" ")}
        fill="rgba(56, 189, 248, 0.12)"
        stroke="rgba(56, 189, 248, 0.5)"
        strokeWidth={1}
      />
      {cal.camera_pts.map(([x, y], i) => (
        <circle
          key={`c${i}`}
          cx={(x / 100) * size}
          cy={(y / 100) * size}
          r={2.5}
          fill="rgba(56, 189, 248, 0.8)"
        />
      ))}
      {/* Floor quad */}
      <polygon
        points={cal.floor_pts.map(([x, y]) => `${(x / 100) * size},${(y / 100) * size}`).join(" ")}
        fill="rgba(251, 146, 60, 0.12)"
        stroke="rgba(251, 146, 60, 0.5)"
        strokeWidth={1}
      />
      {cal.floor_pts.map(([x, y], i) => (
        <circle
          key={`f${i}`}
          cx={(x / 100) * size}
          cy={(y / 100) * size}
          r={2.5}
          fill="rgba(251, 146, 60, 0.8)"
        />
      ))}
    </svg>
  );
}

export function CalibrationCard({ calibration }: { calibration: CorridorCalibration | null }) {
  if (!calibration) {
    return (
      <GlassPanel className="p-5">
        <SectionHeader title="Calibration" subtitle="No calibration data for this camera" />
        <p className="text-xs text-white/40">
          This camera has no homography calibration. Add one via the calibration tool to enable
          floor-plan mapping.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-5">
      <SectionHeader
        title="Calibration"
        subtitle={`Homography mapping · ${calibration.floor_w}×${calibration.floor_h} floor`}
        action={
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
            Active
          </span>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <MiniFloorPreview cal={calibration} />

        <div className="flex flex-1 flex-col gap-4">
          <PointList label="Camera points (% of frame)" points={calibration.camera_pts} />
          <PointList label="Floor points (% of plan)" points={calibration.floor_pts} />
        </div>
      </div>
    </GlassPanel>
  );
}
