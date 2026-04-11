"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { useState, type ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
        <TopNav onMenuClick={() => setOpen((v) => !v)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
