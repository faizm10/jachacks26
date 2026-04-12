"use client";

import { LogoMark } from "@/components/brand/logo-mark";
import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "framer-motion";

export function TopNav({
  onMenuClick,
  title = "Dashboard",
}: {
  onMenuClick?: () => void;
  title?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[rgba(8,10,14,0.65)] backdrop-blur-xl">
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
          <Link href="/dashboard" className="hidden items-center gap-2 lg:flex">
            <LogoMark className="h-8 w-8" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-white">{SITE_NAME}</p>
              <p className="text-[11px] font-medium text-white/40">{title}</p>
            </div>
          </Link>
          <div className="lg:hidden">
            <p className="text-sm font-semibold tracking-tight text-white">{title}</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <motion.div whileHover={{ y: -1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
            <Link
              href="/"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Home
            </Link>
          </motion.div>
          <span className="hidden text-white/15 sm:inline">|</span>
          <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/45 sm:inline">
            API: Python (soon)
          </span>
        </nav>
      </div>
    </header>
  );
}
