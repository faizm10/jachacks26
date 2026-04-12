import { CameraDetailView } from "@/components/camera-detail/camera-detail-view";
import type { Metadata } from "next";

export async function generateMetadata(
  props: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await props.params;
  const label = decodeURIComponent(id).replace(/-/g, " ");
  return { title: `Camera · ${label}` };
}

export default async function CameraDetailPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return <CameraDetailView cameraId={decodeURIComponent(id)} />;
}
