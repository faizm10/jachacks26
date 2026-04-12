"use client";

import { cn } from "@/lib/utils";

export function TopNav({
  onMenuClick,
}: {
  onMenuClick?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-[rgba(8,10,14,0.65)] backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 lg:hidden",
              "hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            )}
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <path strokeWidth="1.5" strokeLinecap="round" d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </button>
          <p className="text-sm font-semibold tracking-tight text-white lg:hidden">
            Foco
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <span className="hidden rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/45 sm:inline">
            API: Python (soon)
          </span>
        </nav>
      </div>
    </header>
  );
}
