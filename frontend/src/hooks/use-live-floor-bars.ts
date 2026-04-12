"use client";

import type { FrameAnalysis, DetectedPerson } from "@/lib/types/room";
import type { LivePersonBar } from "@/lib/spatial/john-abbott-hex-heatmap";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── Mappable regions — rooms that can be data-driven from video ── */

export interface MappableRegion {
  id: string;
  label: string;
  floor: "f1" | "bs";
  roomIds: string[];
  /** Currently assigned video filename (without extension), or null */
  assignedVideo: string | null;
  /** Analysis status */
  status: "idle" | "analyzing" | "done" | "error";
  /** If true, this region uses hardcoded sim data (no camera needed) */
  hardcoded?: boolean;
}

export const DEFAULT_REGIONS: MappableRegion[] = [
  // ── Data-driven (need camera selection) ──
  { id: "main-hall", label: "Main Reading Hall", floor: "f1", roomIds: ["101", "101B", "101D"], assignedVideo: null, status: "idle" },
  { id: "open-study", label: "Open Study Core", floor: "bs", roomIds: ["001"], assignedVideo: null, status: "idle" },
  // ── Hardcoded (already live from simulated sensors) ──
  { id: "east-commons", label: "East Commons", floor: "f1", roomIds: ["119"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "study-carrels", label: "Study Carrels", floor: "f1", roomIds: ["101A", "101C"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "group-study", label: "Group Study Room", floor: "f1", roomIds: ["103"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "service-desk", label: "Help & Service Desk", floor: "f1", roomIds: ["104"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "east-wing-study", label: "East Wing Study Rooms", floor: "f1", roomIds: ["112", "114", "116", "118", "120", "122"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "basement-reading", label: "Reading & Lounge", floor: "bs", roomIds: ["002"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "east-wing-lab", label: "East Wing — Lab & Study", floor: "bs", roomIds: ["024", "021"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "foyer", label: "Foyer", floor: "bs", roomIds: ["004"], assignedVideo: null, status: "done", hardcoded: true },
  { id: "basement-study", label: "Basement Study Rooms", floor: "bs", roomIds: ["014", "016", "018", "020", "023", "025"], assignedVideo: null, status: "done", hardcoded: true },
];

/* ── Bbox → room position mapping ── */

function bboxToRoomPosition(bbox: DetectedPerson["bbox"]): { footX: number; footZ: number } {
  const camFootX = bbox.x + bbox.w / 2;
  const camFootY = bbox.y + bbox.h;
  return {
    footX: Math.max(0, Math.min(1, camFootX)),
    footZ: Math.max(0, Math.min(1, camFootY)),
  };
}

function distributePersonsToRooms(persons: DetectedPerson[], roomIds: string[]): LivePersonBar[] {
  const bars: LivePersonBar[] = [];
  const roomCount = roomIds.length;

  for (const person of persons) {
    const { footX, footZ } = bboxToRoomPosition(person.bbox);
    const roomIdx = Math.min(roomCount - 1, Math.floor(footX * roomCount));
    const roomId = roomIds[roomIdx];
    const sliceWidth = 1 / roomCount;
    const localFootX = (footX - roomIdx * sliceWidth) / sliceWidth;

    bars.push({
      roomId,
      footX: Math.max(0.05, Math.min(0.95, localFootX)),
      footZ: Math.max(0.05, Math.min(0.95, footZ)),
      activity: person.activity,
      confidence: person.confidence,
    });
  }
  return bars;
}

/* ── Available cameras from Supabase ── */

export interface CamOption {
  name: string;  // filename without extension
  url: string;
  path: string;
}

/* ── Hook ── */

export interface UseLiveFloorBarsResult {
  bars: LivePersonBar[];
  regions: MappableRegion[];
  cams: CamOption[];
  camsLoading: boolean;
  assignCamera: (regionId: string, videoName: string | null) => void;
  /** Currently focused region (for 3D highlight) */
  activeRegionId: string | null;
  setActiveRegionId: (id: string | null) => void;
  /** Room IDs of the active region (for 3D highlight) */
  activeRoomIds: string[];
}

/** Module-level cache so bars survive page navigations without re-fetching. */
const STORAGE_KEY = "foco:live-bars";

function loadFromStorage(): LivePersonBar[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LivePersonBar[];
  } catch { /* ignore */ }
  return [];
}

function saveToStorage(bars: LivePersonBar[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bars)); } catch { /* ignore */ }
}

let _cachedBars: LivePersonBar[] = [];
let _cachedRegions: MappableRegion[] = [...DEFAULT_REGIONS];
let _cachedCams: CamOption[] = [];
let _camsLoaded = false;
let _storageRestored = false;

/** Read-only access to cached bars (for camera detail pages etc). */
export function getCachedBars(): LivePersonBar[] {
  return _cachedBars;
}

export function useLiveFloorBars(opts?: { autoAssign?: boolean }): UseLiveFloorBarsResult {
  const autoAssign = opts?.autoAssign ?? false;
  const [bars, _setBars] = useState<LivePersonBar[]>(_cachedBars);
  const [regions, _setRegions] = useState<MappableRegion[]>(_cachedRegions);
  const [cams, setCams] = useState<CamOption[]>(_cachedCams);
  const [camsLoading, setCamsLoading] = useState(!_camsLoaded);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const fetchedCams = useRef(_camsLoaded);

  // Wrappers that sync module-level cache
  const setBars: typeof _setBars = useCallback((action) => {
    _setBars((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      _cachedBars = next;
      saveToStorage(next);
      return next;
    });
  }, []);
  const setRegions: typeof _setRegions = useCallback((action) => {
    _setRegions((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      _cachedRegions = next;
      return next;
    });
  }, []);

  // Restore from localStorage on first client mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (_storageRestored) return;
    _storageRestored = true;
    const stored = loadFromStorage();
    if (stored.length > 0) {
      _cachedBars = stored;
      setBars(stored);
      const barRoomIds = new Set(stored.map((b) => b.roomId));
      setRegions((prev) =>
        prev.map((r) => {
          if (r.hardcoded) return r;
          const hasData = r.roomIds.some((id) => barRoomIds.has(id));
          if (hasData) return { ...r, status: "done" as const, assignedVideo: "(cached)" };
          return r;
        }),
      );
    }
  }, [setBars, setRegions]);

  // Fetch available cameras once
  useEffect(() => {
    if (fetchedCams.current) return;
    fetchedCams.current = true;

    fetch("/api/cams")
      .then((r) => r.json())
      .then((data) => {
        const objects: { path: string; url: string; kind: string }[] = data.objects ?? [];
        const videoOptions = objects
          .filter((o) => o.kind === "video")
          .map((o) => ({
            name: o.path.split("/").pop()?.replace(/\.[^.]+$/, "")?.trim().toLowerCase() ?? o.path,
            url: o.url,
            path: o.path,
          }));
        _cachedCams = videoOptions;
        _camsLoaded = true;
        setCams(videoOptions);
        setCamsLoading(false);

        // Auto-assign default videos if enabled (dashboard context)
        if (autoAssign) {
          const hallTest = videoOptions.find((c) => c.name === "hall-test");
          const basement = videoOptions.find((c) => c.name === "basement-2mov");
          if (hallTest || basement) {
            setRegions((prev) =>
              prev.map((r) => {
                if (r.id === "main-hall" && hallTest && !r.assignedVideo) return { ...r, assignedVideo: hallTest.name };
                if (r.id === "open-study" && basement && !r.assignedVideo) return { ...r, assignedVideo: basement.name };
                return r;
              }),
            );
          }
        }
      })
      .catch(() => setCamsLoading(false));
  }, [autoAssign, setRegions]);

  // Run analysis when a region gets a new assignment
  const analyzeRegion = useCallback(
    async (region: MappableRegion, cam: CamOption) => {
      setRegions((prev) =>
        prev.map((r) => (r.id === region.id ? { ...r, status: "analyzing" } : r)),
      );

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame_url: cam.url }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);

        const analysis: FrameAnalysis = await res.json();
        console.log(`[LiveBars] "${region.label}" → ${analysis.persons.length} persons from ${cam.name}`);

        const roomBars = distributePersonsToRooms(analysis.persons, region.roomIds);

        // Update bars: remove old bars for this region's rooms, add new ones
        setBars((prev) => {
          const roomSet = new Set(region.roomIds);
          const kept = prev.filter((b) => !roomSet.has(b.roomId));
          return [...kept, ...roomBars];
        });

        setRegions((prev) =>
          prev.map((r) => (r.id === region.id ? { ...r, status: "done" } : r)),
        );
      } catch (e) {
        console.error(`[LiveBars] Error analyzing "${region.label}":`, e);
        setRegions((prev) =>
          prev.map((r) => (r.id === region.id ? { ...r, status: "error" } : r)),
        );
      }
    },
    [],
  );

  // Watch for assignment changes and trigger analysis
  useEffect(() => {
    for (const region of regions) {
      if (region.assignedVideo && region.status === "idle") {
        const cam = cams.find((c) => c.name === region.assignedVideo);
        if (cam) void analyzeRegion(region, cam);
      }
    }
  }, [regions, cams, analyzeRegion]);

  const assignCamera = useCallback((regionId: string, videoName: string | null) => {
    setRegions((prev) =>
      prev.map((r) => {
        if (r.id !== regionId) return r;
        // Clear old bars for this region
        if (!videoName) {
          setBars((b) => {
            const roomSet = new Set(r.roomIds);
            return b.filter((bar) => !roomSet.has(bar.roomId));
          });
          return { ...r, assignedVideo: null, status: "idle" };
        }
        return { ...r, assignedVideo: videoName, status: "idle" };
      }),
    );
  }, []);

  const activeRoomIds = regions.find((r) => r.id === activeRegionId)?.roomIds ?? [];

  return { bars, regions, cams, camsLoading, assignCamera, activeRegionId, setActiveRegionId, activeRoomIds };
}
