"use client";

import type { RoomStats, RoomInsight } from "@/lib/types/room";
import type { LivePersonBar } from "@/lib/spatial/john-abbott-hex-heatmap";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useCallback, useMemo } from "react";

/* ── Vibe types & palette ── */

type VibeKind = "locked-in" | "social" | "collab" | "transit";

const VIBE_META: Record<VibeKind, { label: string; color: string; hex: string }> = {
  "locked-in": { label: "Locked In", color: "text-red-400", hex: "#ef4444" },
  social:      { label: "Social",    color: "text-orange-400", hex: "#f97316" },
  collab:      { label: "Collaborative", color: "text-violet-400", hex: "#8b5cf6" },
  transit:     { label: "Transit",   color: "text-slate-400", hex: "#64748b" },
};

/* ── Room vibe data structure ── */

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
  isLive: boolean;
}

/* ── Activity → vibe mapping (same as hex heatmap) ── */

function activityToVibe(activity: string): VibeKind {
  const a = activity.toLowerCase();
  if (a.includes("typing") || a.includes("reading") || a.includes("writing") ||
      a.includes("studying") || a.includes("laptop") || a.includes("focus") ||
      a.includes("sitting") || a.includes("working"))
    return "locked-in";
  if (a.includes("talk") || a.includes("chat") || a.includes("social") ||
      a.includes("laugh") || a.includes("group") || a.includes("convers") ||
      a.includes("eating") || a.includes("phone"))
    return "social";
  if (a.includes("collab") || a.includes("present") || a.includes("whiteboard") ||
      a.includes("discuss") || a.includes("help") || a.includes("pair"))
    return "collab";
  return "transit";
}

/* ── Gen-Z vibe keyword from activity breakdown ── */

function vibeFromBreakdown(people: number, dominant: VibeKind, breakdown: { kind: VibeKind; pct: number }[]): { vibe: string; reason: string } {
  const topPct = breakdown[0]?.pct ?? 0;

  if (dominant === "locked-in" && topPct > 70 && people > 10)
    return { vibe: "deep focus era", reason: `${people} people locked in — keyboards clicking, pages turning, zero chatter` };
  if (dominant === "locked-in" && people <= 3)
    return { vibe: "monk mode", reason: `Just ${people} people in pure focus — the grind is real` };
  if (dominant === "locked-in")
    return { vibe: "study szn", reason: `${people} people grinding — mostly heads down, some quiet collaboration` };
  if (dominant === "social" && people > 20)
    return { vibe: "main character energy", reason: `${people} people and it's LOUD — this is the place to be rn` };
  if (dominant === "social")
    return { vibe: "yapping session", reason: `${people} people chatting, laughing — social energy is high` };
  if (dominant === "collab")
    return { vibe: "team grind", reason: `${people} people in collaborative mode — whiteboards and group work` };
  if (dominant === "transit" && people <= 1)
    return { vibe: "NPC hours", reason: people === 0 ? "Zero people detected — the building is on autopilot" : "Just someone passing through" };
  if (dominant === "transit")
    return { vibe: "just passing", reason: `${people} people mostly in transit — not much happening here` };
  return { vibe: "just vibing", reason: `${people} people — nothing crazy, just a normal day` };
}

/* ── Noise estimate from activity types ── */

function estimateNoise(people: number, dominant: VibeKind): number {
  if (people === 0) return 10;
  const base = dominant === "social" ? 45 : dominant === "collab" ? 38 : dominant === "transit" ? 30 : 25;
  return Math.min(85, base + Math.floor(people * 0.8));
}

/* ── Build RoomVibeData from live persons ── */

const ROOM_NAMES: Record<string, { name: string; floor: string }> = {
  "101":  { name: "Main Reading Hall", floor: "1st floor" },
  "101B": { name: "Reading Floor & Stacks", floor: "1st floor" },
  "101D": { name: "Central Corridor", floor: "1st floor" },
  "001":  { name: "Open Study Core", floor: "Basement" },
};

function buildLiveRoomData(roomId: string, persons: LivePersonBar[]): RoomVibeData {
  const meta = ROOM_NAMES[roomId] ?? { name: `Room ${roomId}`, floor: "" };
  const people = persons.length;

  // Count vibes
  const vibeCounts: Record<VibeKind, number> = { "locked-in": 0, social: 0, collab: 0, transit: 0 };
  for (const p of persons) {
    vibeCounts[activityToVibe(p.activity)]++;
  }

  // Build breakdown sorted by count
  const breakdown = (Object.entries(vibeCounts) as [VibeKind, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, pct: Math.round((count / Math.max(1, people)) * 100) }));

  if (breakdown.length === 0) breakdown.push({ kind: "transit", pct: 100 });

  const dominant = breakdown[0].kind;
  const noise = estimateNoise(people, dominant);
  const { vibe, reason } = vibeFromBreakdown(people, dominant, breakdown);

  // Unique activity strings
  const activities = [...new Set(persons.map((p) => p.activity))];

  return {
    name: meta.name,
    floor: meta.floor,
    people,
    noise,
    vibe,
    vibeReason: reason,
    dominant,
    breakdown,
    activities,
    isLive: true,
  };
}

/* ── Hardcoded fallback rooms (non-data-driven) ── */

const FALLBACK_ROOMS: Record<string, RoomVibeData> = {
  "1st floor · 119": {
    name: "East Commons", floor: "1st floor", people: 48, noise: 72,
    vibe: "main character energy",
    vibeReason: "48 people and it's LOUD — this is the place to be rn. group projects, gossip circles, absolute slay",
    dominant: "social",
    breakdown: [{ kind: "social", pct: 55 }, { kind: "collab", pct: 30 }, { kind: "locked-in", pct: 15 }],
    activities: ["Full-volume group debates", "Shared lunch table takeover", "TikTok filming in the corner"],
    isLive: false,
  },
  "Basement · 024": {
    name: "East Wing — Lab & Study", floor: "Basement", people: 14, noise: 30,
    vibe: "lab rat hours", vibeReason: "14 people glued to screens — pure productivity energy",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 70 }, { kind: "collab", pct: 20 }, { kind: "social", pct: 10 }],
    activities: ["Coding assignments", "Running experiments", "Writing lab reports"],
    isLive: false,
  },
  "1st floor · 104": {
    name: "Help & Service Desk", floor: "1st floor", people: 4, noise: 42,
    vibe: "office hours", vibeReason: "Staff helping students — quick questions and quiet problem-solving",
    dominant: "collab",
    breakdown: [{ kind: "collab", pct: 55 }, { kind: "social", pct: 30 }, { kind: "transit", pct: 15 }],
    activities: ["Asking for help", "Returning books", "Printing documents"],
    isLive: false,
  },
};

/* ── Noise / crowd helpers ── */

function noiseVibe(db: number): { label: string; emoji: string; color: string } {
  if (db < 20) return { label: "Silent", emoji: "🤫", color: "text-cyan-300" };
  if (db < 35) return { label: "Whisper-quiet", emoji: "🧘", color: "text-cyan-300" };
  if (db < 50) return { label: "Chill murmur", emoji: "☕", color: "text-emerald-300" };
  if (db < 65) return { label: "Chatty", emoji: "💬", color: "text-amber-300" };
  if (db < 80) return { label: "Buzzing", emoji: "🐝", color: "text-orange-300" };
  return { label: "Loud AF", emoji: "🔊", color: "text-red-300" };
}

function crowdVibe(count: number): { label: string; tag: string; color: string } {
  if (count === 0) return { label: "Ghost town", tag: "empty", color: "text-white/40" };
  if (count <= 3) return { label: "Cozy", tag: "low-key", color: "text-cyan-300" };
  if (count <= 8) return { label: "Vibing", tag: "just right", color: "text-emerald-300" };
  if (count <= 15) return { label: "Packed", tag: "busy", color: "text-amber-300" };
  if (count <= 25) return { label: "Sardines", tag: "crowded", color: "text-orange-300" };
  return { label: "Main character energy", tag: "maxed out", color: "text-red-300" };
}

const CAROUSEL_INTERVAL = 6000;

/* ── Component ── */

export function BuildingVibePanel({
  stats,
  insights: _insights,
  onActiveRoomChange,
  livePersons,
  clickedRoomId,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
  onActiveRoomChange?: (roomId: string) => void;
  livePersons?: LivePersonBar[];
  /** When user clicks a room on the 3D model */
  clickedRoomId?: string | null;
}) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [userSelected, setUserSelected] = useState<string | null>(null);

  // Build live room data from analysis
  const liveRoomEntries = useMemo(() => {
    if (!livePersons || livePersons.length === 0) return {};
    const byRoom = new Map<string, LivePersonBar[]>();
    for (const p of livePersons) {
      const existing = byRoom.get(p.roomId) ?? [];
      existing.push(p);
      byRoom.set(p.roomId, existing);
    }
    const entries: Record<string, RoomVibeData> = {};
    for (const [roomId, persons] of byRoom) {
      const meta = ROOM_NAMES[roomId];
      if (!meta) continue;
      const key = `${meta.floor} · ${roomId}`;
      entries[key] = buildLiveRoomData(roomId, persons);
    }
    return entries;
  }, [livePersons]);

  // Merge live + fallback rooms
  const allRooms = useMemo(() => {
    return { ...FALLBACK_ROOMS, ...liveRoomEntries };
  }, [liveRoomEntries]);

  const roomKeys = useMemo(() => Object.keys(allRooms), [allRooms]);

  const onActiveRoomChangeStable = useCallback(
    (id: string) => onActiveRoomChange?.(id),
    [onActiveRoomChange],
  );

  // When user clicks a room on the model, jump to it
  useEffect(() => {
    if (!clickedRoomId) return;
    // Find matching key
    const match = roomKeys.find((k) => k.includes(clickedRoomId));
    if (match) {
      setUserSelected(match);
    }
  }, [clickedRoomId, roomKeys]);

  // Auto-carousel — pauses when user has manually selected a room
  useEffect(() => {
    if (userSelected) return; // paused
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % roomKeys.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, [userSelected, roomKeys.length]);

  // Active key: user selection overrides carousel
  const currentKey = userSelected ?? roomKeys[carouselIndex % roomKeys.length] ?? roomKeys[0];
  const roomData = allRooms[currentKey];

  // Notify parent of active room for 3D highlight
  useEffect(() => {
    if (currentKey) onActiveRoomChangeStable(currentKey);
  }, [currentKey, onActiveRoomChangeStable]);

  if (!roomData) return null;

  const noise = noiseVibe(roomData.noise);
  const crowd = crowdVibe(roomData.people);
  const dominantMeta = VIBE_META[roomData.dominant];

  return (
    <GlassPanel className="flex h-full flex-col border-none bg-transparent shadow-none backdrop-blur-none backdrop-saturate-100 p-6">
      {/* Navigation: dots + back button */}
      <div className="mb-4 flex items-center gap-2">
        {userSelected && (
          <button
            type="button"
            onClick={() => setUserSelected(null)}
            className="mr-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            ← Auto
          </button>
        )}
        <div className="flex items-center gap-1.5">
          {roomKeys.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setUserSelected(key);
                setCarouselIndex(i);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                key === currentKey ? "w-6 bg-white/60" : "w-1.5 bg-white/20 hover:bg-white/35"
              }`}
              aria-label={allRooms[key]?.name}
            />
          ))}
        </div>
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
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
              {roomData.floor}
              {roomData.isLive && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                  Live
                </span>
              )}
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
