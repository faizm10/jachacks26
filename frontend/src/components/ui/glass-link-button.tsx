"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "ghost";

export function GlassLinkButton({
  className,
  variant = "primary",
  children,
  href,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  const styles =
    variant === "primary"
      ? "border border-primary/25 bg-primary/12 text-primary hover:bg-primary/18"
      : "border border-border/90 bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground";

  return (
    <Link href={href} {...props} className="inline-flex rounded-full focus-visible:outline-none">
      <motion.span
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className={cn(base, styles, className)}
      >
        {children}
      </motion.span>
    </Link>
  );
}
