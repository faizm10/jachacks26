"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import { getCamsBucketName } from "@/lib/supabase/cams-bucket";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
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
  selected,
  onSelect,
  onExpand,
}: {
  obj: CamsLatestObject;
  selected: boolean;
  onSelect: (o: CamsLatestObject) => void;
  onExpand: (o: CamsLatestObject) => void;
}) {
  const [errored, setErrored] = useState(false);
  const fileName = obj.path.split("/").pop() ?? obj.path;

  const onError = useCallback(() => setErrored(true), []);

  return (
    <button
      type="button"
      onClick={() => onSelect(obj)}
      onDoubleClick={() => onExpand(obj)}
      className={`group relative w-full overflow-hidden rounded-xl border text-left outline-none transition-all ${
        selected
          ? "border-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.12)] ring-1 ring-emerald-400/25"
          : "border-white/[0.06] hover:border-white/[0.14] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
      } bg-black/40 focus-visible:ring-2 focus-visible:ring-white/25`}
    >
      <div className="aspect-video w-full">
        {!errored ? (
          obj.kind === "video" ? (
            <video
              key={obj.url}
              className="pointer-events-none h-full w-full object-cover"
              src={obj.url}
              autoPlay
              muted
              playsInline
              loop
              onError={onError}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={obj.url}
              alt={`Camera frame ${obj.path}`}
              src={obj.url}
              className="pointer-events-none h-full w-full object-cover"
              onError={onError}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-xs text-white/40">Failed to load</p>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="truncate text-[11px] text-white/70">{fileName}</p>
          {selected && (
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
              Selected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/35 opacity-0 transition-opacity group-hover:opacity-100">
          {selected ? "Double-click to enlarge" : "Click to analyze"}
        </p>
      </div>
    </button>
  );
}

export interface CameraFeedPanelProps {
  selectedUrl?: string | null;
  onSelect?: (obj: CamsLatestObject) => void;
}

export function CameraFeedPanel({ selectedUrl, onSelect }: CameraFeedPanelProps) {
  const bucketName = getCamsBucketName();
  const { status, objects, error, refresh } = useCamsAllFeeds();
  const [expanded, setExpanded] = useState<CamsLatestObject | null>(null);
  const closeExpanded = useCallback(() => setExpanded(null), []);

  const subtitle =
    status === "ready"
      ? `${objects.length} file${objects.length !== 1 ? "s" : ""} · Supabase ${bucketName}`
      : `Storage bucket ${bucketName}`;

  return (
    <GlassPanel className="relative overflow-hidden p-5">
      <SectionHeader
        title="Camera feed"
        subtitle={subtitle}
        action={<StatusBadge status={status} />}
      />

      {status === "loading" ? (
        <div className="mt-3 flex min-h-[180px] items-center justify-center rounded-xl border border-white/[0.06] bg-black/40">
          <motion.div
            className="h-8 w-8 rounded-full border-2 border-white/15 border-t-white/70"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            aria-label="Loading feed"
          />
        </div>
      ) : status === "empty" ? (
        <div className="mt-3 flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-black/40 px-6 text-center">
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
        <div className="mt-3 flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-black/40 px-6 text-center">
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
          {!selectedUrl && objects.length > 0 && (
            <p className="mt-2 text-xs text-white/40">
              Select a feed to analyze
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {objects.map((obj) => (
              <VideoTile
                key={obj.path}
                obj={obj}
                selected={obj.url === selectedUrl}
                onSelect={(o) => onSelect?.(o)}
                onExpand={setExpanded}
              />
            ))}
          </div>
        </>
      )}
      {expanded ? (
        <MediaExpandModal key={expanded.path} obj={expanded} onClose={closeExpanded} />
      ) : null}
    </GlassPanel>
  );
}
