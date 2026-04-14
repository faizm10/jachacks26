"use client";

import { LogoMark } from "@/components/brand/logo-mark";
import Link from "next/link";
import { motion } from "framer-motion";

export function SiteHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Foco</span>
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-border/90 bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          Open dashboard
        </Link>
      </div>
    </motion.header>
  );
}
