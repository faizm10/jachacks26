"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useActiveVideo } from "@/components/room-intel/active-video-context";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import { getCamsBucketName } from "@/lib/supabase/cams-bucket";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
import { Clapperboard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

function StatusBadge({ status }: { status: ReturnType<typeof useCamsAllFeeds>["status"] }) {
  if (status === "ready") {
    return (
      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
        Live
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        Loading
      </span>
    );
  }
  if (status === "empty") {
    return (
      <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
        Empty
      </span>
    );
  }
  return (
    <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-200/90">
      Error
    </span>
  );
}

function MediaExpandModal({ obj, onClose }: { obj: CamsLatestObject; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [obj.path, onClose]);

  const fileName = obj.path.split("/").pop() ?? obj.path;

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Expanded view: ${fileName}`}
        className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgba(6,8,12,0.92)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-5">
          <p className="min-w-0 truncate text-sm font-medium text-white/90">{fileName}</p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/50 p-3 sm:p-5">
          {obj.kind === "video" ? (
            <video
              className="max-h-[min(78vh,760px)] w-full rounded-lg object-contain"
              src={obj.url}
              controls
              playsInline
              autoPlay
              muted
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`Expanded ${fileName}`}
              src={obj.url}
              className="max-h-[min(78vh,760px)] w-full object-contain"
            />
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function VideoTile({
  obj,
  isFloorActive,
  isLiveSelected,
  onPick,
  onExpand,
}: {
  obj: CamsLatestObject;
  isFloorActive: boolean;
  isLiveSelected: boolean;
  onPick: (o: CamsLatestObject) => void;
  onExpand: (o: CamsLatestObject) => void;
}) {
  const [errored, setErrored] = useState(false);
  const fileName = obj.path.split("/").pop() ?? obj.path;

  const borderClass =
    isFloorActive && isLiveSelected
      ? "border-emerald-400/45 border-sky-400/45 shadow-[0_0_0_1px_rgba(56,189,248,0.15),0_0_20px_rgba(52,211,153,0.12)]"
      : isFloorActive
        ? "border-sky-400/50 shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_8px_32px_rgba(0,0,0,0.4)]"
        : isLiveSelected
          ? "border-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.12)] ring-1 ring-emerald-400/25"
          : "border-white/[0.06] hover:border-white/[0.18] hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPick(obj)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(obj);
        }
      }}
      onDoubleClick={() => onExpand(obj)}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-2xl border bg-black/40 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-white/25 ${borderClass}`}
    >
      <div className="aspect-video min-h-[11.5rem] w-full bg-black sm:min-h-[13rem] lg:min-h-[14.5rem]">
        {!errored ? (
          obj.kind === "video" ? (
            <video
              key={obj.url}
              className="h-full w-full object-cover"
              src={obj.url}
              autoPlay
              muted
              playsInline
              loop
              onError={() => setErrored(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={obj.url}
              alt={fileName}
              src={obj.url}
              className="h-full w-full object-cover"
              onError={() => setErrored(true)}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center gap-2">
            <Clapperboard className="h-7 w-7 text-white/25" />
            <p className="text-xs text-white/40">Failed to load</p>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
        {isFloorActive ? (
          <span className="rounded-full border border-sky-400/40 bg-sky-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300">
            Floor map
          </span>
        ) : null}
        {isLiveSelected ? (
          <span className="rounded-full border border-emerald-400/35 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
            Live AI
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExpand(obj);
        }}
        className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/60 px-2 py-1 text-[10px] font-semibold text-white/70 backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 hover:text-white"
      >
        ↗
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-3 sm:px-4 sm:py-3.5">
        <p className="truncate text-xs font-medium text-white/80 sm:text-[13px]">{fileName}</p>
        <p className="mt-0.5 text-[10px] text-white/40 opacity-0 transition-opacity group-hover:opacity-100 sm:text-[11px]">
          {isLiveSelected && isFloorActive
            ? "Double-click to enlarge · drives floor plan + live analysis"
            : isLiveSelected
              ? "Double-click to enlarge · selected for live analysis"
              : "Click for floor plan · optional live analysis from dashboard"}
        </p>
      </div>
    </div>
  );
}

export interface CameraFeedPanelProps {
  selectedUrl?: string | null;
  onSelect?: (obj: CamsLatestObject) => void;
  /** Rendered below the selected tile — inline AR detection overlay */
  detectionOverlay?: React.ReactNode;
}

export function CameraFeedPanel({ selectedUrl, onSelect, detectionOverlay }: CameraFeedPanelProps) {
  const bucketName = getCamsBucketName();
  const { selectFromTile, activeVideo } = useActiveVideo();
  const { status, objects, error, refresh } = useCamsAllFeeds();
  const [expanded, setExpanded] = useState<CamsLatestObject | null>(null);
  const closeExpanded = useCallback(() => setExpanded(null), []);

  const handlePick = useCallback(
    (o: CamsLatestObject) => {
      selectFromTile(o);
      onSelect?.(o);
    },
    [selectFromTile, onSelect],
  );

  const subtitle =
    status === "ready"
      ? `${objects.length} file${objects.length !== 1 ? "s" : ""} · Supabase ${bucketName}`
      : `Storage bucket ${bucketName}`;

  return (
    <GlassPanel className="relative overflow-hidden p-6 sm:p-7">
      <SectionHeader
        title="Camera feed"
        subtitle={subtitle}
        action={<StatusBadge status={status} />}
      />

      {status === "loading" ? (
        <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-2xl border border-white/[0.06] bg-black/40">
          <motion.div
            className="h-8 w-8 rounded-full border-2 border-white/15 border-t-white/70"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            aria-label="Loading feed"
          />
        </div>
      ) : status === "empty" ? (
        <div className="mt-4 flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-black/40 px-6 text-center">
          <p className="text-sm font-medium text-white/65">No media in {bucketName} yet</p>
          <p className="max-w-sm text-xs text-white/40">
            Upload .mp4 files to the <span className="text-white/55">{bucketName}</span> bucket.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.1]"
          >
            Refresh
          </button>
        </div>
      ) : status === "error" ? (
        <div className="mt-4 flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-black/40 px-6 text-center">
          <p className="text-sm font-medium text-red-200/90">Could not load bucket</p>
          <p className="max-w-md text-xs text-white/45">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {!selectedUrl && objects.length > 0 && onSelect ? (
            <p className="mt-2 text-xs text-white/40">Select a feed for live analysis (optional)</p>
          ) : null}
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {objects.map((obj) => (
              <VideoTile
                key={obj.path}
                obj={obj}
                isFloorActive={activeVideo?.path === obj.path}
                isLiveSelected={selectedUrl != null && obj.url === selectedUrl}
                onPick={handlePick}
                onExpand={setExpanded}
              />
            ))}
          </div>

          {/* Inline detection overlay for the selected feed */}
          {detectionOverlay && selectedUrl ? (
            <div className="mt-5">
              {detectionOverlay}
            </div>
          ) : null}
        </>
      )}
      {expanded ? (
        <MediaExpandModal key={expanded.path} obj={expanded} onClose={closeExpanded} />
      ) : null}
    </GlassPanel>
  );
}
