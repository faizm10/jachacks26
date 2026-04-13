import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Foco",
    template: "%s · Foco",
  },
  description:
    "Turn cameras into a live 3D motion map. Not headcounts — behaviour. Spatial awareness for any campus or building.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },                        // legacy fallback
    ],
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "Foco — Spatial Awareness",
    description:
      "Turn cameras into a live 3D motion map. Not headcounts — behaviour.",
    images: [{ url: "/og-image.svg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Foco — Spatial Awareness",
    description: "Turn cameras into a live 3D motion map. Not headcounts — behaviour.",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${playfairDisplay.variable} min-h-screen bg-background antialiased text-foreground`}
      >
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
