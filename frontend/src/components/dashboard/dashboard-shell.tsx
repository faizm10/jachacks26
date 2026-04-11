"use client";

import { ActiveVideoProvider } from "@/components/room-intel/active-video-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { useState, type ReactNode } from "react";

export function DashboardShell({
  children,
  topNavTitle = "Dashboard",
}: {
  children: ReactNode;
  /** Shown under the logo on large screens (e.g. "Spatial motion map"). */
  topNavTitle?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
        <TopNav onMenuClick={() => setOpen((v) => !v)} title={topNavTitle} />
        <main className="relative flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(120, 140, 255, 0.07), transparent 55%)",
            }}
          />
          <div className="relative">
            <ActiveVideoProvider>{children}</ActiveVideoProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
