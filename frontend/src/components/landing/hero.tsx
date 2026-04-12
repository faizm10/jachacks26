"use client";

import { SITE_NAME } from "@/lib/brand";
import { GlassLinkButton } from "@/components/ui/glass-link-button";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 28 },
  },
};

export function Hero() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-3xl text-center"
    >
      <motion.p
        variants={item}
        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40"
      >
        Spatial awareness
      </motion.p>
      <motion.h1
        variants={item}
        className="mt-5 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.08]"
      >
        {SITE_NAME}
      </motion.h1>
      <motion.p
        variants={item}
        className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/55 sm:text-lg"
      >
        Understand how a room is being used in real time — movement, focus, and context
        fused into a single calm surface.
      </motion.p>
      <motion.div
        variants={item}
        className="mt-10 flex flex-wrap items-center justify-center gap-3"
      >
        <GlassLinkButton href="/dashboard" variant="primary">
          View demo
        </GlassLinkButton>
        <GlassLinkButton href="/spatial-map" variant="ghost">
          Spatial map
        </GlassLinkButton>
      </motion.div>
    </motion.div>
  );
}
