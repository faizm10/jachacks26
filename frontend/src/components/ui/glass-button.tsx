"use client";

import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "ghost";

export function GlassButton({
  className,
  variant = "primary",
  children,
  ...props
}: HTMLMotionProps<"button"> & { variant?: Variant }) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40";

  const styles =
    variant === "primary"
      ? "bg-white/[0.12] text-white border border-white/[0.14] hover:bg-white/[0.16]"
      : "bg-transparent text-white/80 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white";

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring" as const, stiffness: 420, damping: 28 }}
      className={cn(base, styles, className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}
