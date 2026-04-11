"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useCamsAllFeeds } from "@/hooks/use-cams-all-feeds";
import { getCamsBucketName } from "@/lib/supabase/cams-bucket";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
import { useState, useCallback } from "react";

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

function VideoTile({ obj }: { obj: CamsLatestObject }) {
  const [errored, setErrored] = useState(false);
  const fileName = obj.path.split("/").pop() ?? obj.path;

  const onError = useCallback(() => setErrored(true), []);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
      <div className="aspect-video w-full">
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
              onError={onError}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={obj.url}
              alt={`Camera frame ${obj.path}`}
              src={obj.url}
              className="h-full w-full object-cover"
              onError={onError}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-xs text-white/40">Failed to load</p>
          </div>
        )}
      </div>
      {/* filename label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <p className="truncate text-[11px] text-white/70">{fileName}</p>
      </div>
    </div>
  );
}

export function CameraFeedPanel() {
  const bucketName = getCamsBucketName();
  const { status, objects, error, refresh } = useCamsAllFeeds();

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
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {objects.map((obj) => (
            <VideoTile key={obj.path} obj={obj} />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
