"use client";

import type { RoomStats, RoomInsight } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { motion } from "framer-motion";

/* ── Noise level → human-readable description ── */
function noiseVibe(db: number): {
  label: string;
  emoji: string;
  color: string;
} {
  if (db < 20) return { label: "Silent", emoji: "🤫", color: "text-cyan-300" };
  if (db < 35)
    return { label: "Whisper-quiet", emoji: "🧘", color: "text-cyan-300" };
  if (db < 50)
    return { label: "Chill murmur", emoji: "☕", color: "text-emerald-300" };
  if (db < 65) return { label: "Chatty", emoji: "💬", color: "text-amber-300" };
  if (db < 80)
    return { label: "Buzzing", emoji: "🐝", color: "text-orange-300" };
  return { label: "Loud AF", emoji: "🔊", color: "text-red-300" };
}

/* ── Crowdedness → vibe ── */
function crowdVibe(count: number): {
  label: string;
  tag: string;
  color: string;
} {
  if (count === 0)
    return { label: "Ghost town", tag: "empty", color: "text-white/40" };
  if (count <= 3)
    return { label: "Cozy", tag: "low-key", color: "text-cyan-300" };
  if (count <= 8)
    return { label: "Vibing", tag: "just right", color: "text-emerald-300" };
  if (count <= 15)
    return { label: "Packed", tag: "busy", color: "text-amber-300" };
  if (count <= 25)
    return { label: "Sardines", tag: "crowded", color: "text-orange-300" };
  return {
    label: "Main character energy",
    tag: "maxed out",
    color: "text-red-300",
  };
}

/* ── Gen Z vibe summary from activities ── */
function vibeKeyword(
  insights: RoomInsight[],
  stats: RoomStats,
): { label: string; reason: string } {
  const texts = insights
    .map((i) => i.detail.toLowerCase() + " " + i.title.toLowerCase())
    .join(" ");
  const n = stats.activePeople;
  const db = stats.ambientDb;

  if (
    texts.includes("focus") ||
    texts.includes("quiet") ||
    texts.includes("typing")
  )
    return {
      label: "deep focus era",
      reason: `${n} people locked in with noise at just ~${db} dB — nobody's talking, everyone's grinding`,
    };
  if (
    texts.includes("talk") ||
    texts.includes("chat") ||
    texts.includes("social")
  )
    return {
      label: "yapping session",
      reason: `Chatter detected across the floor — ${n} people and ~${db} dB of pure conversation`,
    };
  if (
    texts.includes("walk") ||
    texts.includes("moving") ||
    texts.includes("entry")
  )
    return {
      label: "main character walks",
      reason: `Lots of movement right now with ${n} people coming and going`,
    };
  if (texts.includes("phone") || texts.includes("device"))
    return {
      label: "doom scrolling",
      reason: `${n} people mostly on their devices — noise is low at ~${db} dB`,
    };
  if (texts.includes("eating") || texts.includes("food"))
    return {
      label: "munch o'clock",
      reason: `Food spotted — ${n} people refueling before the next grind`,
    };
  if (n === 0)
    return {
      label: "NPC hours",
      reason: "Zero people detected — the building is on autopilot",
    };
  if (n > 15)
    return {
      label: "absolute chaos",
      reason: `${n} people packed in at ~${db} dB — it's giving overcrowded`,
    };
  return {
    label: "just vibing",
    reason: `${n} people, ~${db} dB — nothing crazy, just a normal day`,
  };
}

export function BuildingVibePanel({
  stats,
  insights,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
}) {
  const noise = noiseVibe(stats.ambientDb);
  const crowd = crowdVibe(stats.activePeople);
  const { label: vibe, reason: vibeReason } = vibeKeyword(insights, stats);

  return (
    <GlassPanel className="flex h-full flex-col border-none bg-transparent shadow-none backdrop-blur-none backdrop-saturate-100 p-6">
      {/* Big vibe keyword */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-6 rounded-2xl  p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
          Today's vibe
        </p>
        <p
          className="mt-2 text-7xl font-bold leading-tight text-white"
          style={{ fontFamily: "var(--font-caveat)" }}>
          {vibe}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          {vibeReason}
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* People count */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            People
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">
            {stats.activePeople}
          </p>
          <p className={`mt-1 text-xs font-medium ${crowd.color}`}>
            {crowd.label}
          </p>
          <p className="text-[10px] text-white/30">{crowd.tag}</p>
        </div>

        {/* Noise */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Noise
          </p>
          <p className="mt-1 text-3xl">{noise.emoji}</p>
          <p className={`mt-1 text-xs font-medium ${noise.color}`}>
            {noise.label}
          </p>
          <p className="text-[10px] text-white/30">
            {stats.ambientDb > 0 ? `~${stats.ambientDb} dB` : "no data"}
          </p>
        </div>

        {/* Hot zone */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Hot zone
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {stats.focalPoint}
          </p>
          <p className="mt-1 text-[10px] text-white/30">most activity</p>
        </div>

        {/* Session */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Avg dwell
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {stats.dwellMinutes > 0 ? `${stats.dwellMinutes}m` : "—"}
          </p>
          <p className="mt-1 text-[10px] text-white/30">per person</p>
        </div>
      </div>

      {/* Recent insights feed */}
      <div className="mt-5 flex-1 overflow-y-auto">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
          Activity feed
        </p>
        <ul className="flex flex-col gap-1.5">
          {insights.slice(0, 6).map((ins) => (
            <li
              key={ins.id}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <p className="text-[11px] font-medium text-white/75">
                {ins.title}
              </p>
              <p className="mt-0.5 text-[10px] text-white/35">{ins.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </GlassPanel>
  );
}
