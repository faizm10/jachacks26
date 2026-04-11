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
    "relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

  const styles =
    variant === "primary"
      ? "bg-white/[0.12] text-white border border-white/[0.14] hover:bg-white/[0.16]"
      : "bg-transparent text-white/80 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white";

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
