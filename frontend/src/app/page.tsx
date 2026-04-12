import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { getRoomSnapshot } from "@/lib/api/room-intelligence";

export default async function HomePage() {
  const snapshot = await getRoomSnapshot();
  return <DashboardGrid snapshot={snapshot} />;
}
