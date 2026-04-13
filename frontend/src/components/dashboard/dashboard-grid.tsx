"use client";

import { ArLabelColorLegend } from "@/components/panels/ar-label-color-legend";
import { BuildingVibePanel } from "@/components/panels/building-vibe-panel";
import { CameraFeedPanel } from "@/components/panels/camera-feed-panel";
import { FloorOverviewPanel } from "@/components/panels/floor-overview-panel";
import { getCameraRegion } from "@/lib/camera-regions";
import type { RoomSnapshot } from "@/lib/types/room";
import { useLiveFloorBars } from "@/hooks/use-live-floor-bars";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

const block = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 28 },
  },
};

export function DashboardGrid({ snapshot }: { snapshot: RoomSnapshot }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [clickedRoomId, setClickedRoomId] = useState<string | null>(null);

  const { bars: livePersons, regions, cams } = useLiveFloorBars({ autoAssign: true });

  // Map room IDs → video URLs for the vibe panel
  const roomVideoUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of regions) {
      if (!r.assignedVideo || r.hardcoded) continue;
      // Try matching by cam name first, then by assigned name containing the cam name
      const cam = cams.find((c) => c.name === r.assignedVideo) ??
                  cams.find((c) => r.assignedVideo!.includes(c.name) || c.name.includes(r.assignedVideo!));
      if (cam) {
        for (const roomId of r.roomIds) { if (roomId !== "101B") map[roomId] = cam.url; }
      }
    }
    // Fallback: match known region IDs to cams (covers localStorage "(cached)" case)
    if (cams.length > 0) {
      const hallCam = cams.find((c) => c.name === "hall-test");
      const basementCam = cams.find((c) => c.name === "basement-2mov");
      for (const r of regions) {
        if (r.hardcoded || r.status !== "done") continue;
        if (r.id === "main-hall" && hallCam) {
          for (const roomId of r.roomIds) { if (!map[roomId] && roomId !== "101B") map[roomId] = hallCam.url; }
        }
        if (r.id === "open-study" && basementCam) {
          for (const roomId of r.roomIds) { if (!map[roomId]) map[roomId] = basementCam.url; }
        }
      }
    }
    // ── Hardcoded video mappings ──
    // Room ID → cam filename (edit here to change which video shows for each room)
    const ROOM_VIDEO_MAP: Record<string, string> = {
      "101":  "first-floor-study-area",  // Main Reading Hall
      "101D": "first-floor-study-area",  // Central Corridor
      "119":  "hall-test",               // East Commons
      "024":  "basement-hallway-3",      // East Wing Lab
      "021":  "basement-hallway-3",      // East Wing Study
    };
    for (const [roomId, camName] of Object.entries(ROOM_VIDEO_MAP)) {
      const cam = cams.find((c) => c.name === camName);
      if (cam) map[roomId] = cam.url;
    }
    return map;
  }, [regions, cams]);

  // Rooms currently being analyzed → yellow pulse on model
  const pulseRoomIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of regions) {
      if (r.status === "analyzing") {
        const prefix = r.floor === "f1" ? "1st floor" : "Basement";
        for (const roomId of r.roomIds) ids.push(`${prefix} · ${roomId}`);
      }
    }
    return ids.length > 0 ? ids : null;
  }, [regions]);

  const handleSelect = useCallback(
    (obj: { url: string; path?: string }) => {
      setSelectedUrl((prev) => (prev === obj.url ? null : obj.url));
      const camId =
        obj.path
          ?.split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "")
          ?.trim()
          .toLowerCase() ?? null;
      setSelectedCameraId((prev) => (prev === camId ? null : camId));
    },
    [],
  );

  const handleRoomClick = useCallback((roomId: string | null) => {
    setClickedRoomId(roomId);
  }, []);

  // Expand a single active room ID to all rooms in the same region
  // e.g. "1st floor · 101" → ["1st floor · 101", "1st floor · 101B", "1st floor · 101D"]
  const highlightRoomIds = useMemo(() => {
    if (!activeRoomId) return null;
    // Extract the room ID portion after "floor · "
    const parts = activeRoomId.split(" · ");
    if (parts.length < 2) return activeRoomId;
    const floorPrefix = parts[0];
    const roomId = parts[1];
    // Find which region contains this room
    const region = regions.find((r) => r.roomIds.includes(roomId));
    if (!region || region.roomIds.length <= 1) return activeRoomId;
    // Return all room IDs in this region with the floor prefix
    return region.roomIds.map((id) => `${floorPrefix} · ${id}`);
  }, [activeRoomId, regions]);

  const cameraRegion = useMemo(
    () => (selectedCameraId ? getCameraRegion(selectedCameraId) : null),
    [selectedCameraId],
  );

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
      }}
      className="mx-auto max-w-7xl space-y-6 text-foreground"
    >
      {/* ═══ HERO: Floor map + Building vibe ═══ */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
        <motion.div variants={block} className="flex h-full min-h-0 flex-col lg:col-span-7">
          <FloorOverviewPanel
            cameraRegion={cameraRegion}
            highlightRoomId={highlightRoomIds}
            onRoomClick={handleRoomClick}
            livePersons={livePersons}
            pulseRoomIds={pulseRoomIds}
          />
        </motion.div>
        <motion.div variants={block} className="lg:col-span-5">
          <BuildingVibePanel
            stats={snapshot.stats}
            insights={snapshot.insights}
            onActiveRoomChange={setActiveRoomId}
            livePersons={livePersons}
            clickedRoomId={clickedRoomId}
            roomVideoUrls={roomVideoUrls}
          />
        </motion.div>
      </div>

      {/* ═══ CAMERA FEEDS with inline detection overlay ═══ */}
      <motion.div variants={block} id="admin-section" className="scroll-mt-24">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border/80" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
            Camera feeds & detection
          </span>
          <div className="h-px flex-1 bg-border/80" />
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12" id="camera-feed">
        <motion.div variants={block} className="lg:col-span-3">
          <div className="sticky top-24">
            <ArLabelColorLegend />
          </div>
        </motion.div>
        <motion.div variants={block} className="lg:col-span-9">
          <CameraFeedPanel
            selectedUrl={selectedUrl}
            onSelect={handleSelect}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
