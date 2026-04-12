"use client";

import { ActiveVideoProvider } from "@/components/room-intel/active-video-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { useState, type ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <main className="relative flex-1 bg-background px-4 pb-6 pt-24 sm:px-6 sm:pt-28 lg:px-8 lg:pt-28">
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
  );
}
