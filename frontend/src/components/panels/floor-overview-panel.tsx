"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import type { CameraRegion } from "@/lib/camera-regions";

export function FloorOverviewPanel({ cameraRegion: _cameraRegion }: { cameraRegion: CameraRegion | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0f14]">
      <JohnAbbottLibraryFloorThree layoutVariant="stackedEmbed" className="p-3 sm:p-4" />
    </div>
  );
}
