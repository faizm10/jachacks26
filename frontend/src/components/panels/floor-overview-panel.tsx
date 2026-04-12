"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import type { CameraRegion } from "@/lib/camera-regions";

export function FloorOverviewPanel({ cameraRegion: _cameraRegion }: { cameraRegion: CameraRegion | null }) {
  return (
    <div className="flex h-full min-h-0 w-full min-h-[420px] flex-col lg:min-h-[min(88vh,920px)]">
      <JohnAbbottLibraryFloorThree layoutVariant="stackedEmbed" fillColumn className="min-h-0 flex-1" />
    </div>
  );
}
