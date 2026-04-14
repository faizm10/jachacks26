"use client";

import { ActiveVideoProvider } from "@/components/room-intel/active-video-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { useState, type ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <TopNav onMenuClick={() => setOpen((o) => !o)} />
      <main className="relative flex-1 bg-background px-4 pb-6 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(79, 70, 229, 0.09), transparent 55%), radial-gradient(ellipse 50% 35% at 80% 0%, rgba(59, 130, 246, 0.04), transparent 50%)",
          }}
        />
        <div className="relative">
          <ActiveVideoProvider>{children}</ActiveVideoProvider>
        </div>
      </main>
    </div>
  );
}
