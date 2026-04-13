"use client";

import type { RoomStats, RoomInsight } from "@/lib/types/room";
import type { LivePersonBar } from "@/lib/spatial/john-abbott-hex-heatmap";
import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useCallback, useMemo } from "react";

/* ── Vibe types & palette ── */

type VibeKind = "locked-in" | "social" | "collab" | "transit";

const VIBE_META: Record<VibeKind, { label: string; color: string; hex: string }> = {
  "locked-in": { label: "Locked In", color: "text-red-800", hex: "#ef4444" },
  social:      { label: "Social",    color: "text-orange-800", hex: "#f97316" },
  collab:      { label: "Collaborative", color: "text-violet-800", hex: "#8b5cf6" },
  transit:     { label: "Transit",   color: "text-slate-700", hex: "#64748b" },
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
  videoUrl?: string;
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

  // Activity strings with person counts
  const activityCounts = new Map<string, number>();
  for (const p of persons) {
    activityCounts.set(p.activity, (activityCounts.get(p.activity) ?? 0) + 1);
  }
  const activities = [...activityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([act, count]) => count > 1 ? `${act} (${count})` : act);

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
    name: "East Wing — Lab & Study", floor: "Basement", people: 3, noise: 22,
    vibe: "lab rat hours", vibeReason: "Just 3 people locked in — headphones on, zero distractions, pure grind",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 100 }],
    activities: ["Coding assignments", "Running experiments", "Writing lab reports"],
    isLive: false,
  },
  "1st floor · 101D": {
    name: "Central Corridor", floor: "1st floor", people: 6, noise: 28,
    vibe: "silent grind", vibeReason: "6 people heads down on laptops — nobody's talking, pure lock-in energy",
    dominant: "locked-in",
    breakdown: [{ kind: "locked-in", pct: 85 }, { kind: "collab", pct: 15 }],
    activities: ["sitting and working on laptop (6)"],
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
  if (db < 20) return { label: "Silent", emoji: "🤫", color: "text-cyan-800" };
  if (db < 35) return { label: "Whisper-quiet", emoji: "🧘", color: "text-cyan-800" };
  if (db < 50) return { label: "Chill murmur", emoji: "☕", color: "text-emerald-800" };
  if (db < 65) return { label: "Chatty", emoji: "💬", color: "text-amber-800" };
  if (db < 80) return { label: "Buzzing", emoji: "🐝", color: "text-orange-800" };
  return { label: "Loud AF", emoji: "🔊", color: "text-red-800" };
}

function crowdVibe(count: number): { label: string; tag: string; color: string } {
  if (count === 0) return { label: "Ghost town", tag: "empty", color: "text-muted-foreground" };
  if (count <= 3) return { label: "Cozy", tag: "low-key", color: "text-cyan-800" };
  if (count <= 8) return { label: "Vibing", tag: "just right", color: "text-emerald-800" };
  if (count <= 15) return { label: "Packed", tag: "busy", color: "text-amber-800" };
  if (count <= 25) return { label: "Sardines", tag: "crowded", color: "text-orange-800" };
  return { label: "Main character energy", tag: "maxed out", color: "text-red-800" };
}

const CAROUSEL_INTERVAL = 6000;

/* ── Component ── */

export function BuildingVibePanel({
  stats,
  insights: _insights,
  onActiveRoomChange,
  livePersons,
  clickedRoomId,
  roomVideoUrls,
}: {
  stats: RoomStats;
  insights: RoomInsight[];
  onActiveRoomChange?: (roomId: string) => void;
  livePersons?: LivePersonBar[];
  /** When user clicks a room on the 3D model */
  clickedRoomId?: string | null;
  /** Map of room ID → video URL for showing source footage */
  roomVideoUrls?: Record<string, string>;
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
      const data = buildLiveRoomData(roomId, persons);
      data.videoUrl = roomVideoUrls?.[roomId];
      entries[key] = data;
    }
    return entries;
  }, [livePersons, roomVideoUrls]);

  // Merge live + fallback rooms, injecting video URLs into fallbacks where available
  const allRooms = useMemo(() => {
    const merged = { ...FALLBACK_ROOMS, ...liveRoomEntries };
    if (roomVideoUrls) {
      // Inject video URLs into fallback rooms (e.g. east wing → basement-hallway-3)
      for (const [key, data] of Object.entries(merged)) {
        if (data.videoUrl) continue; // already has one
        // Extract room ID from key like "Basement · 024"
        const roomId = key.split(" · ")[1];
        if (roomId && roomVideoUrls[roomId]) {
          merged[key] = { ...data, videoUrl: roomVideoUrls[roomId] };
        }
      }
    }
    return merged;
  }, [liveRoomEntries, roomVideoUrls]);

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

  // Live analysis for the current room's video — keeps activity labels in sync with what's on screen
  const { analysis: liveAnalysis } = useLiveAnalysis(roomData?.videoUrl ?? null);

  // Use live-detected activities when available, fall back to cached
  const displayActivities = useMemo(() => {
    if (liveAnalysis?.persons && liveAnalysis.persons.length > 0) {
      const counts = new Map<string, number>();
      for (const p of liveAnalysis.persons) {
        counts.set(p.activity, (counts.get(p.activity) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([act, count]) => count > 1 ? `${act} (${count})` : act);
    }
    return roomData?.activities ?? [];
  }, [liveAnalysis, roomData?.activities]);

  // Notify parent of active room(s) for 3D highlight
  // Some carousel entries represent multi-room regions
  useEffect(() => {
    if (!currentKey) return;
    onActiveRoomChangeStable(currentKey);
  }, [currentKey, onActiveRoomChangeStable]);

  if (!roomData) return null;

  const noise = noiseVibe(roomData.noise);
  const crowd = crowdVibe(roomData.people);
  const dominantMeta = VIBE_META[roomData.dominant];

  return (
    <GlassPanel className="flex h-full flex-col border-none bg-transparent p-6 text-foreground shadow-none backdrop-blur-none backdrop-saturate-100">
      {/* Navigation: dots + back button */}
      <div className="mb-4 flex items-center gap-2">
        {userSelected && (
          <button
            type="button"
            onClick={() => setUserSelected(null)}
            className="mr-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
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
                key === currentKey ? "w-6 bg-primary/70" : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/40"
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
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {roomData.floor}
              {roomData.isLive && (
                <span className="rounded-full border border-emerald-800/45 bg-emerald-600/18 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-950">
                  Live
                </span>
              )}
            </p>
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {roomData.name}
            </p>
          </div>

          {/* Big vibe keyword */}
          <div className="mb-5 rounded-2xl p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              Room vibe
            </p>
            <p
              className="mt-2 text-5xl font-bold leading-tight text-foreground"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {roomData.vibe}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {roomData.vibeReason}
            </p>
          </div>

          {/* Vibe breakdown bars */}
          <div className="mb-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Vibe breakdown
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
                <span key={b.kind} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: VIBE_META[b.kind].hex }}
                  />
                  <span className={VIBE_META[b.kind].color}>{VIBE_META[b.kind].label}</span>
                  <span className="text-muted-foreground/80">{b.pct}%</span>
                </span>
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{roomData.people}</p>
              <p className={`mt-1 text-xs font-medium ${crowd.color}`}>{crowd.label}</p>
              <p className="text-[10px] text-muted-foreground">{crowd.tag}</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Noise</p>
              <p className="mt-1 text-3xl">{noise.emoji}</p>
              <p className={`mt-1 text-xs font-medium ${noise.color}`}>{noise.label}</p>
              <p className="text-[10px] text-muted-foreground">~{roomData.noise} dB</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dominant</p>
              <p className={`mt-1 text-sm font-semibold ${dominantMeta.color}`}>{dominantMeta.label}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">primary energy</p>
            </div>
            <div className="rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg dwell</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {stats.dwellMinutes > 0 ? `${stats.dwellMinutes}m` : "—"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">per person</p>
            </div>
          </div>

          {/* Source video + detected activities */}
          <div className="mt-5 flex-1 overflow-y-auto">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Detected activities
            </p>
            <div className="grid grid-cols-2 gap-3">
              {roomData.videoUrl ? (
                <div className="overflow-hidden rounded-lg border border-border/80">
                  <div className="aspect-video w-full">
                    <ARLabelsOverlay
                      key={roomData.videoUrl}
                      videoUrl={roomData.videoUrl}
                      persons={[]}
                      inline
                      continuous
                    />
                  </div>
                  <p className="bg-muted px-2 py-1 text-[9px] text-muted-foreground">Source feed · AR overlay</p>
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/40">
                  <svg viewBox="0 0 24 24" className="mb-1.5 h-5 w-5 text-muted-foreground/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-[9px] font-medium text-muted-foreground">Restricted access</p>
                  <p className="text-[8px] text-muted-foreground/70">Security camera feed</p>
                </div>
              )}
              <ul className="flex flex-col gap-1.5">
                {displayActivities.map((act) => (
                  <li key={act} className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2">
                    <p className="text-[11px] font-medium text-foreground">{act}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </GlassPanel>
  );
}
