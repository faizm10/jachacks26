"use client";

import { ARLabelsOverlay } from "@/components/panels/ar-labels-overlay";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useActiveVideo } from "@/components/room-intel/active-video-context";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import { getCamsBucketName } from "@/lib/supabase/cams-bucket";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
import { Clapperboard } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function StatusBadge({ status }: { status: ReturnType<typeof useCamsAllFeeds>["status"] }) {
  if (status === "ready") {
    return (
      <span className="rounded-full border border-emerald-600/30 bg-emerald-600/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
        Live
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Loading
      </span>
    );
  }
  if (status === "empty") {
    return (
      <span className="rounded-full border border-border bg-muted/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Empty
      </span>
    );
  }
  return (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-800">
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
      <div className="absolute inset-0 bg-stone-900/35 backdrop-blur-md" aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Expanded view: ${fileName}`}
        className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-[0_24px_60px_rgba(62,48,40,0.14)]"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3 sm:px-5">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{fileName}</p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-3 sm:p-5">
          {obj.kind === "video" ? (
            <div className="relative w-full max-h-[min(78vh,760px)] aspect-video rounded-lg overflow-hidden">
              <ARLabelsOverlay
                videoUrl={obj.url}
                persons={[]}
                inline
              />
            </div>
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

type AnalysisStatus = "idle" | "sending" | "done" | "failed";

function VideoTile({
  obj,
  isFloorActive,
  onPick,
  onExpand,
}: {
  obj: CamsLatestObject;
  isFloorActive: boolean;
  onPick: (o: CamsLatestObject) => void;
  /** Used for image expand only */
  onExpand: (o: CamsLatestObject) => void;
}) {
  const [errored, setErrored] = useState(false);
  const [arExpanded, setArExpanded] = useState(false);
  const [desc, setDesc] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [retryKey, setRetryKey] = useState(0);
  const [videoRef, setVideoRef] = useState<RefObject<HTMLVideoElement | null> | null>(null);
  const [inView, setInView] = useState(true);
  const tileRef = useRef<HTMLDivElement>(null);
  const fileName = obj.path.split("/").pop() ?? obj.path;
  const isVideo = obj.kind === "video";

  // Lazy load: only render video/AR when tile is in viewport
  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "100px 0px" }, // start loading 100px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Per-tile live analysis — captures frames from this tile's video
  const { analysis } = useLiveAnalysis(isVideo ? obj.url : null, {
    realtimeFrameCaptureMs: 4000,
    videoRef: videoRef ?? undefined,
  });

  const handleVideoRef = useCallback((ref: RefObject<HTMLVideoElement | null>) => {
    setVideoRef(ref);
  }, []);

  const handleSceneDescription = useCallback((d: string, status: AnalysisStatus) => {
    setDesc(d);
    setAnalysisStatus(status);
  }, []);

  const handleRetry = useCallback(() => {
    setAnalysisStatus("idle");
    setDesc("");
    setRetryKey((k) => k + 1);
  }, []);

  const borderClass = isFloorActive
    ? "border-sky-500/45 shadow-[0_0_0_1px_rgba(14,165,233,0.2),0_8px_32px_rgba(62,48,40,0.12)]"
    : "border-border/90 hover:border-primary/35 hover:shadow-[0_8px_32px_rgba(62,48,40,0.1)]";

  return (
    <div ref={tileRef} className="flex flex-col gap-0">
      {/* Tile */}
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
        onDoubleClick={() => isVideo ? setArExpanded(true) : onExpand(obj)}
        className={`group relative w-full cursor-pointer overflow-hidden rounded-2xl border bg-card/50 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/40 ${borderClass}`}
      >
        <div className="aspect-video min-h-[11.5rem] w-full bg-black sm:min-h-[13rem] lg:min-h-[14.5rem]">
          {!errored ? (
            !inView ? (
              /* Placeholder when out of viewport — no video loaded */
              <div className="flex h-full w-full items-center justify-center">
                <p className="text-[11px] text-muted-foreground/60">{fileName}</p>
              </div>
            ) : isVideo ? (
              <ARLabelsOverlay
                videoUrl={obj.url}
                persons={analysis?.persons ?? []}
                liveSceneSummary={analysis?.sceneDescription}
                inline
                onSceneDescription={handleSceneDescription}
                expanded={arExpanded}
                onExpandedChange={setArExpanded}
                retryKey={retryKey}
                onVideoRef={handleVideoRef}
                peopleCount={analysis?.peopleCount}
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
              <Clapperboard className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Failed to load</p>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {isFloorActive ? (
            <span className="rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-800">
              Floor map
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            isVideo ? setArExpanded(true) : onExpand(obj);
          }}
          className="absolute right-2 top-2 rounded-lg border border-border bg-popover/90 px-2 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-card hover:text-foreground"
        >
          ↗
        </button>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/80 to-transparent px-3 py-3 sm:px-4 sm:py-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="pointer-events-none truncate text-xs font-medium text-stone-100 sm:text-[13px]">{fileName}</p>
            <Link
              href={`/camera/${encodeURIComponent(fileName.replace(/\.[^.]+$/, ""))}`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-stone-100 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-stone-50"
            >
              Details &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Description + retry below the tile */}
      {(desc || analysisStatus === "failed") && (
        <div className="flex items-start gap-2 rounded-b-xl border border-t-0 border-border/80 bg-muted/40 px-3 py-2">
          {desc ? (
            <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
          ) : (
            <p className="flex-1 text-[11px] text-red-700">Analysis failed</p>
          )}
          {analysisStatus === "failed" && (
            <button
              type="button"
              onClick={handleRetry}
              className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface CameraFeedPanelProps {
  selectedUrl?: string | null;
  onSelect?: (obj: CamsLatestObject) => void;
}

export function CameraFeedPanel({ selectedUrl, onSelect }: CameraFeedPanelProps) {
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
        <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-2xl border border-border/80 bg-muted/50">
        <motion.div
            className="h-8 w-8 rounded-full border-2 border-border border-t-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            aria-label="Loading feed"
          />
        </div>
      ) : status === "empty" ? (
        <div className="mt-4 flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-muted/50 px-6 text-center">
          <p className="text-sm font-medium text-foreground">No media in {bucketName} yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Upload .mp4 files to the <span className="text-foreground/80">{bucketName}</span> bucket.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      ) : status === "error" ? (
        <div className="mt-4 flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/80 bg-muted/50 px-6 text-center">
          <p className="text-sm font-medium text-red-700">Could not load bucket</p>
          <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-5">
            {objects.map((obj) => (
              <VideoTile
                key={obj.path}
                obj={obj}
                isFloorActive={activeVideo?.path === obj.path}
                onPick={handlePick}
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
