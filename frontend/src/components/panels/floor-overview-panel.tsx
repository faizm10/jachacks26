"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import { PointCloudFloorPlan } from "@/components/spatial-map/point-cloud-floor-plan";
import { JOHN_ABBOTT_COLLEGE_URL } from "@/lib/spatial/john-abbott-library-3d-data";
import type { CameraRegion } from "@/lib/camera-regions";
import { cn } from "@/lib/utils";
import { useState } from "react";

type FloorHeroVisual = "mesh" | "pointCloud";

export function FloorOverviewPanel({ cameraRegion: _cameraRegion }: { cameraRegion: CameraRegion | null }) {
  const [visual, setVisual] = useState<FloorHeroVisual>("mesh");

  return (
    <div className="flex h-full min-h-0 w-full min-h-[420px] flex-col lg:min-h-[min(88vh,920px)]">
      <div className="mb-1.5 flex shrink-0 items-center justify-between gap-3">
        <div
          className="inline-flex rounded-md border border-white/[0.05] bg-white/[0.02] p-px"
          role="tablist"
          aria-label="Library visualization"
        >
          <button
            type="button"
            role="tab"
            aria-selected={visual === "mesh"}
            onClick={() => setVisual("mesh")}
            className={cn(
              "rounded-[5px] px-2 py-0.5 text-[10px] font-medium transition-colors",
              visual === "mesh"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/30 hover:bg-white/[0.04] hover:text-white/50",
            )}
          >
            Solid 3D
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={visual === "pointCloud"}
            onClick={() => setVisual("pointCloud")}
            className={cn(
              "rounded-[5px] px-2 py-0.5 text-[10px] font-medium transition-colors",
              visual === "pointCloud"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/30 hover:bg-white/[0.04] hover:text-white/50",
            )}
          >
            Point scan
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-right">
          <div className="leading-none">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">Campus model</p>
            <p className="mt-0.5 text-[11px] font-semibold tracking-tight text-white/80">
              John Abbott College
              <span className="ml-1 font-normal text-white/40">&middot; Herzberg Library</span>
            </p>
          </div>
          <a
            href={JOHN_ABBOTT_COLLEGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-sky-300/70 underline decoration-sky-400/30 underline-offset-2 transition-colors hover:text-sky-200"
          >
            &#x2197;
          </a>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {visual === "mesh" ? (
          <JohnAbbottLibraryFloorThree layoutVariant="stackedEmbed" fillColumn className="min-h-0 flex-1" />
        ) : (
          <PointCloudFloorPlan fillColumn className="min-h-0 flex-1" />
        )}
      </div>
    </div>
  );
}
