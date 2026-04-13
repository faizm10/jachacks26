"use client";

import { cn } from "@/lib/utils";

export function TopNav({
  onMenuClick,
}: {
  onMenuClick?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/75 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/90 bg-card/60 text-muted-foreground lg:hidden",
              "hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
            )}
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <path strokeWidth="1.5" strokeLinecap="round" d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </button>
          <p className="text-sm font-semibold tracking-tight text-foreground lg:hidden">
            Foco
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-[11px] font-medium text-foreground/70 sm:inline">
            API: Python (soon)
          </span>
        </nav>
      </div>
    </header>
  );
}
