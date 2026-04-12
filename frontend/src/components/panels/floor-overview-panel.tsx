"use client";

import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import type { CameraRegion } from "@/lib/camera-regions";

export function FloorOverviewPanel({ cameraRegion: _cameraRegion }: { cameraRegion: CameraRegion | null }) {
  return <JohnAbbottLibraryFloorThree layoutVariant="stackedEmbed" />;
}
