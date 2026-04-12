"use client";

import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { CorridorCalibrationPanel } from "@/components/panels/corridor-calibration-panel";
import { InteractiveFloorPlanPanel } from "@/components/panels/interactive-floor-plan-panel";
import type { FloorPlanData } from "@/lib/types/room";
import { motion } from "framer-motion";

const block = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 30 },
  },
};

export function SpatialMapWorkspace({ fallback }: { fallback: FloorPlanData }) {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        variants={block}
        initial="hidden"
        animate="show"
        className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6"
      >
        <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          How this flow works
        </h1>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-white/60 sm:text-[15px]">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-xs font-semibold text-white/80">
              1
            </span>
            <span>
              <strong className="font-medium text-white/85">The 3D map</strong> is an interactive
              John Abbott College Library model (orbit, zoom, room picks). When you analyze a clip, the
              same homography overlay is shown on the <strong className="text-white/85">3D ground slab</strong>{" "}
              and in the 2D schematic below, using{" "}
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[12px] text-white/70">
                /floorplans/floorplan_transparent.png
              </code>{" "}
              plus the API heat PNG. Extruded rooms are illustrative; the heat is aligned to the floor
              image footprint, not per-room geometry.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-xs font-semibold text-white/80">
              2
            </span>
            <span>
              <strong className="font-medium text-white/85">Pick a clip</strong> (filename only on
              tiles; optional <strong className="text-white/85">Preview</strong> if you need to
              see pixels). That URL drives motion analysis — humans stay off the main map.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-xs font-semibold text-white/80">
              3
            </span>
            <span>
              <strong className="font-medium text-white/85">Python</strong> (
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[12px] text-white/70">
                POST /floorplan/analyze
              </code>
              ) returns a heat grid + zones in 0–100% space; we <strong className="text-white/85">draw them on the 2D schematic preview</strong> under the 3D view.
              For <strong className="text-white/85">IMG_5530.mp4</strong>, the API can{" "}
              <strong className="text-white/85">warp video motion into the corridor band</strong> on the
              PNG (tunable via{" "}
              <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[12px] text-white/70">
                FLOORPLAN_IMG5530_*_ROI
              </code>{" "}
              in the backend env).
            </span>
          </li>
        </ol>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <motion.div
          variants={block}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.06 }}
          className="lg:col-span-6"
          id="camera-feed"
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
            Motion clips
          </p>
          <CameraFeedPanel />
        </motion.div>
        <motion.div
          variants={block}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.1 }}
          className="min-h-[320px] lg:col-span-6"
        >
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
            3D library + motion
          </p>
          <InteractiveFloorPlanPanel fallback={fallback} />
        </motion.div>
      </div>

      {/* Corridor calibration — map each camera to its floor plan region */}
      <motion.div variants={block} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
          Camera → corridor calibration
        </p>
        <CorridorCalibrationPanel />
      </motion.div>
    </div>
  );
}
