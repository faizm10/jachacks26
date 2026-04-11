import { SpatialMapWorkspace } from "@/components/spatial-map/spatial-map-workspace";
import { getRoomSnapshot } from "@/lib/api/room-intelligence";

export default async function SpatialMapPage() {
  const snapshot = await getRoomSnapshot();
  return <SpatialMapWorkspace fallback={snapshot.floorPlan} />;
}
