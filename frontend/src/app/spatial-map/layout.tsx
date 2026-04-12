import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Spatial map",
  description:
    "Motion-informed layout from camera video — zones and heat inferred from movement, not architectural CAD.",
};

export default function SpatialMapLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
