"use client";

import type { RoomStats, RoomInsight } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

/* ── Simulated room vibe data ── */

type VibeKind = "locked-in" | "social" | "collab" | "transit";

const VIBE_META: Record<VibeKind, { label: string; color: string; hex: string }> = {
  "locked-in": { label: "Locked In", color: "text-red-400", hex: "#ef4444" },
  social:      { label: "Social",    color: "text-orange-400", hex: "#f97316" },
  collab:      { label: "Collaborative", color: "text-violet-400", hex: "#8b5cf6" },
  transit:     { label: "Transit",   color: "text-slate-400", hex: "#64748b" },
};

interface RoomVibeData {
  name: string;
  floor: string;
  people: number;
  noise: number;
  vibe: string;
  vibeReason: string;
  dominant: VibeKind;
  breakdown: { kind: VibeKind; pct: number }[];
  activities: string[];
}

const SIMULATED_ROOMS: Record<string, RoomVibeData> = {
  "1st floor · 101": {
    name: "Main Reading Hall", floor: "1st floor", people: 18, noise: 32,
    vibe: "deep focus era", vibeReason: "18 people locked in — keyboards clicking, pages turning, zero chatter",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 60 }, { kind: "collab", pct: 25 }, { kind: "social", pct: 15 }],
    activities: ["Typing on laptops", "Reading textbooks", "Taking notes quietly", "One person sketching"],
  },
  "1st floor · 119": {
    name: "East Commons", floor: "1st floor", people: 48, noise: 72,
    vibe: "main character energy",
    vibeReason: "48 people and it's LOUD — this is the place to be rn. group projects, gossip circles, someone just pulled out a speaker. absolute slay",
    dominant: "social",
    breakdown: [{ kind: "social", pct: 55 }, { kind: "collab", pct: 30 }, { kind: "locked-in", pct: 15 }],
    activities: ["Full-volume group debates", "Shared lunch table takeover", "TikTok filming in the corner", "Spontaneous study group forming", "Someone DJing off a laptop", "Friend reunion happening every 5 mins"],
  },
  "Basement · 001": {
    name: "Open Study Core", floor: "Basement", people: 15, noise: 35,
    vibe: "mixed energy", vibeReason: "15 people — half grinding solo, half in study groups whispering",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 45 }, { kind: "social", pct: 30 }, { kind: "collab", pct: 25 }],
    activities: ["Solo studying", "Pair programming", "Quiet group review", "Headphones on, world off"],
  },
  "Basement · 024": {
    name: "East Wing — Lab & Study", floor: "Basement", people: 14, noise: 30,
    vibe: "lab rat hours", vibeReason: "14 people glued to screens — pure productivity energy",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 70 }, { kind: "collab", pct: 20 }, { kind: "social", pct: 10 }],
    activities: ["Coding assignments", "Running experiments", "Writing lab reports", "Debugging together"],
  },
  "1st floor · 104": {
    name: "Help & Service Desk", floor: "1st floor", people: 4, noise: 42,
    vibe: "office hours", vibeReason: "Staff helping students — quick questions and quiet problem-solving",
    dominant: "collab",
    breakdown: [{ kind: "collab", pct: 55 }, { kind: "social", pct: 30 }, { kind: "transit", pct: 15 }],
    activities: ["Asking for help", "Returning books", "Printing documents"],
  },
  "1st floor · 103": {
    name: "Group Study Room", floor: "1st floor", people: 8, noise: 48,
    vibe: "team grind", vibeReason: "Two study groups going hard — whiteboards full, energy high",
    dominant: "collab",
    breakdown: [{ kind: "collab", pct: 45 }, { kind: "social", pct: 35 }, { kind: "locked-in", pct: 20 }],
    activities: ["Whiteboard session", "Group discussion", "Sharing screens"],
  },
};

const CAROUSEL_KEYS = Object.keys(SIMULATED_ROOMS);
const CAROUSEL_INTERVAL = 3000;

/* ── Noise level → human-readable description ── */
function noiseVibe(db: number): { label: string; emoji: string; color: string } {
  if (db < 20) return { label: "Silent", emoji: "🤫", color: "text-cyan-300" };
  if (db < 35) return { label: "Whisper-quiet", emoji: "🧘", color: "text-cyan-300" };
  if (db < 50) return { label: "Chill murmur", emoji: "☕", color: "text-emerald-300" };
  if (db < 65) return { label: "Chatty", emoji: "💬", color: "text-amber-300" };
  if (db < 80) return { label: "Buzzing", emoji: "🐝", color: "text-orange-300" };
  return { label: "Loud AF", emoji: "🔊", color: "text-red-300" };
}

/* ── Crowdedness → vibe ── */
function crowdVibe(count: number): { label: string; tag: string; color: string } {
  if (count === 0) return { label: "Ghost town", tag: "empty", color: "text-white/40" };
  if (count <= 3) return { label: "Cozy", tag: "low-key", color: "text-cyan-300" };
  if (count <= 8) return { label: "Vibing", tag: "just right", color: "text-emerald-300" };
  if (count <= 15) return { label: "Packed", tag: "busy", color: "text-amber-300" };
  if (count <= 25) return { label: "Sardines", tag: "crowded", color: "text-orange-300" };
  return { label: "Main character energy", tag: "maxed out", color: "text-red-300" };
}

export function BuildingVibePanel({
  stats,
  insights: _insights,
  onActiveRoomChange,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
  onActiveRoomChange?: (roomId: string) => void;
}) {
  const [index, setIndex] = useState(0);

  const onActiveRoomChangeStable = useCallback(
    (id: string) => onActiveRoomChange?.(id),
    [onActiveRoomChange],
  );

  // Auto-carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % CAROUSEL_KEYS.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Notify parent of active room
  const currentKey = CAROUSEL_KEYS[index];
  useEffect(() => {
    onActiveRoomChangeStable(currentKey);
  }, [currentKey, onActiveRoomChangeStable]);

  const roomData = SIMULATED_ROOMS[currentKey];
  const noise = noiseVibe(roomData.noise);
  const crowd = crowdVibe(roomData.people);
  const dominantMeta = VIBE_META[roomData.dominant];

  return (
    <GlassPanel className="flex h-full flex-col border-none bg-transparent shadow-none backdrop-blur-none backdrop-saturate-100 p-6">
      {/* Carousel dots */}
      <div className="mb-4 flex items-center gap-1.5">
        {CAROUSEL_KEYS.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-white/60" : "w-1.5 bg-white/20"
            }`}
            aria-label={SIMULATED_ROOMS[key].name}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentKey}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="flex flex-1 flex-col"
        >
          {/* Room name + floor */}
          <div className="mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              {roomData.floor}
            </p>
            <p className="text-lg font-semibold tracking-tight text-white/90">
              {roomData.name}
            </p>
          </div>

          {/* Big vibe keyword */}
          <div className="mb-5 rounded-2xl p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Room vibe
            </p>
            <p
              className="mt-2 text-5xl font-bold leading-tight text-white"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {roomData.vibe}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              {roomData.vibeReason}
            </p>
          </div>

          {/* Vibe breakdown bars */}
          <div className="mb-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
              Vibe breakdown
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              {roomData.breakdown.map((b) => (
                <div
                  key={b.kind}
                  className="h-full transition-all duration-700"
                  style={{ width: `${b.pct}%`, backgroundColor: VIBE_META[b.kind].hex }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {roomData.breakdown.map((b) => (
                <span key={b.kind} className="flex items-center gap-1.5 text-[10px] text-white/50">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: VIBE_META[b.kind].hex }}
                  />
                  <span className={VIBE_META[b.kind].color}>{VIBE_META[b.kind].label}</span>
                  <span className="text-white/30">{b.pct}%</span>
                </span>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">People</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">{roomData.people}</p>
              <p className={`mt-1 text-xs font-medium ${crowd.color}`}>{crowd.label}</p>
              <p className="text-[10px] text-white/30">{crowd.tag}</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Noise</p>
              <p className="mt-1 text-3xl">{noise.emoji}</p>
              <p className={`mt-1 text-xs font-medium ${noise.color}`}>{noise.label}</p>
              <p className="text-[10px] text-white/30">~{roomData.noise} dB</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Dominant</p>
              <p className={`mt-1 text-sm font-semibold ${dominantMeta.color}`}>{dominantMeta.label}</p>
              <p className="mt-1 text-[10px] text-white/30">primary energy</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Avg dwell</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {stats.dwellMinutes > 0 ? `${stats.dwellMinutes}m` : "—"}
              </p>
              <p className="mt-1 text-[10px] text-white/30">per person</p>
            </div>
          </div>

          {/* Activity feed */}
          <div className="mt-5 flex-1 overflow-y-auto">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
              Detected activities
            </p>
            <ul className="flex flex-col gap-1.5">
              {roomData.activities.map((act) => (
                <li key={act} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[11px] font-medium text-white/75">{act}</p>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>
    </GlassPanel>
  );
}
