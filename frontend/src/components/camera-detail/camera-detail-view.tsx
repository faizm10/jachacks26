"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { CalibrationCard } from "@/components/camera-detail/calibration-card";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { JohnAbbottLibraryFloorThree } from "@/components/spatial-map/john-abbott-library-floor-three";
import type { FocusRegion } from "@/components/spatial-map/john-abbott-library-floor-three";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import { getCameraRoomMapping } from "@/lib/camera-regions";
import type { CorridorCalibration } from "@/lib/api/calibration";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

export function CameraDetailView({ cameraId }: { cameraId: string }) {
  const { objects, status } = useCamsAllFeeds();
  const [calibration, setCalibration] = useState<CorridorCalibration | null>(null);
  const [calLoading, setCalLoading] = useState(true);
  const [videoRef, setVideoRef] = useState<RefObject<HTMLVideoElement | null> | null>(null);

  // Find the matching camera feed object
  const feed: CamsLatestObject | null = useMemo(() => {
    if (status !== "ready") return null;
    return (
      objects.find((o) => {
        const name = o.path.split("/").pop()?.replace(/\.[^.]+$/, "")?.trim().toLowerCase() ?? "";
        return name === cameraId.toLowerCase();
      }) ?? null
    );
  }, [objects, status, cameraId]);

  const isVideo = feed?.kind === "video";

  // Live analysis for this feed
  const { analysis } = useLiveAnalysis(isVideo ? feed!.url : null, {
    realtimeFrameCaptureMs: 4000,
    videoRef: videoRef ?? undefined,
  });

  const handleVideoRef = useCallback((ref: RefObject<HTMLVideoElement | null>) => {
    setVideoRef(ref);
  }, []);

  // Fetch calibration from backend
  useEffect(() => {
    let cancelled = false;
    setCalLoading(true);

    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
    if (!base) {
      setCalLoading(false);
      return;
    }

    fetch(`${base}/calibrations`)
      .then((r) => r.json())
      .then((data: { calibrations: CorridorCalibration[] }) => {
        if (cancelled) return;
        const match = data.calibrations.find(
          (c) => c.camera_id.toLowerCase() === cameraId.toLowerCase(),
        );
        setCalibration(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setCalibration(null);
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cameraId]);

  // Build focusRegion from predefined camera → room mapping
  const roomMapping = useMemo(() => getCameraRoomMapping(cameraId), [cameraId]);

  const focusRegion: FocusRegion | null = useMemo(() => {
    if (!roomMapping) return null;
    return {
      floor: roomMapping.floor,
      roomIds: roomMapping.roomIds,
      label: roomMapping.zone,
    };
  }, [roomMapping]);

  const label = cameraId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="mx-auto max-w-7xl space-y-6"
    >
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Link
          href="/#camera-feed"
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/90"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">{label}</h1>
          <p className="text-xs text-white/40">
            {roomMapping ? `${roomMapping.zone} · ${roomMapping.floor === "f1" ? "1st floor" : "Basement"}` : "Camera detail view"}
          </p>
        </div>
      </div>

      {/* ═══ VIDEO PLAYER ═══ */}
      <GlassPanel className="overflow-hidden p-5">
        <SectionHeader
          title="Live feed"
          subtitle={feed ? feed.path.split("/").pop() ?? "" : "Loading..."}
          action={
            analysis ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
                {analysis.peopleCount ?? 0} detected
              </span>
            ) : null
          }
        />

        {status === "loading" ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-white/[0.06] bg-black/40">
            <motion.div
              className="h-8 w-8 rounded-full border-2 border-white/15 border-t-white/70"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
          </div>
        ) : !feed ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-black/40 text-center">
            <p className="text-sm font-medium text-white/60">Camera not found</p>
            <p className="max-w-sm text-xs text-white/40">
              No feed matching &ldquo;{cameraId}&rdquo; was found in the storage bucket.
            </p>
          </div>
        ) : isVideo ? (
          <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.06]" style={{ aspectRatio: "16 / 9" }}>
            <ARLabelsOverlay
              videoUrl={feed.url}
              persons={analysis?.persons ?? []}
              liveSceneSummary={analysis?.sceneDescription}
              inline
              continuous
              onVideoRef={handleVideoRef}
              peopleCount={analysis?.peopleCount}
            />
          </div>
        ) : (
          <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={label} src={feed.url} className="w-full object-contain" />
          </div>
        )}

        {/* Scene description */}
        {analysis?.sceneDescription ? (
          <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/50">
            {analysis.sceneDescription}
          </p>
        ) : null}
      </GlassPanel>

      {/* ═══ CALIBRATION + 3D FLOOR MAP side by side ═══ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {calLoading ? (
            <GlassPanel className="flex min-h-[200px] items-center justify-center p-5">
              <motion.div
                className="h-6 w-6 rounded-full border-2 border-white/15 border-t-white/70"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
            </GlassPanel>
          ) : (
            <CalibrationCard calibration={calibration} />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <GlassPanel className="p-5">
            <SectionHeader
              title={roomMapping ? `3D floor map — ${roomMapping.zone}` : "3D floor map"}
              subtitle={
                roomMapping
                  ? `${roomMapping.floor === "f1" ? "1st floor" : "Basement"} · rooms ${roomMapping.roomIds.join(", ")}`
                  : "Full building view"
              }
              action={
                roomMapping ? (
                  <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-200/90">
                    {roomMapping.zone}
                  </span>
                ) : null
              }
            />
            <JohnAbbottLibraryFloorThree
              showHexColumns={false}
              focusRegion={focusRegion}
              className="mt-2"
            />
          </GlassPanel>
        </motion.div>
      </div>
    </motion.div>
  );
}
