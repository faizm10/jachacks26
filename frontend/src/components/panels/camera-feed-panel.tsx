"use client";

import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { useCamsBucketFeed } from "@/hooks/use-cams-bucket-feed";
import { getCamsBucketName } from "@/lib/supabase/cams-bucket";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";

function StatusBadge({ status }: { status: ReturnType<typeof useCamsBucketFeed>["status"] }) {
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
  if (status === "unconfigured") {
    return (
      <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100/90">
        Setup
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

export function CameraFeedPanel() {
  const bucketName = getCamsBucketName();
  const { status, frame, displayUrl, error, refresh } = useCamsBucketFeed();
  const [mediaError, setMediaError] = useState(false);

  const onMediaLoad = useCallback(() => {
    setMediaError(false);
  }, []);

  const onMediaError = useCallback(() => {
    setMediaError(true);
  }, []);

  const subtitle =
    status === "ready" && frame
      ? `Supabase · ${bucketName} / ${frame.path}`
      : status === "unconfigured"
        ? "Add Supabase env vars to connect"
        : `Storage bucket ${bucketName}`;

  return (
    <GlassPanel className="relative overflow-hidden p-5 min-h-[220px] lg:min-h-[280px]">
      <SectionHeader
        title="Camera feed"
        subtitle={subtitle}
        action={<StatusBadge status={status} />}
      />
      <div className="relative mt-1 aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
        {status === "unconfigured" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-white/70">Connect the {bucketName} bucket</p>
            <p className="max-w-md text-xs leading-relaxed text-white/45">
              Set <code className="rounded bg-white/[0.08] px-1 py-0.5 text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="rounded bg-white/[0.08] px-1 py-0.5 text-[11px]">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              in <code className="rounded bg-white/[0.08] px-1 py-0.5 text-[11px]">frontend/.env.local</code>.
              Create a Storage bucket (default name <span className="text-white/60">{bucketName}</span>, override with{" "}
              <code className="text-[11px] text-white/50">NEXT_PUBLIC_CAMS_BUCKET</code>) and allow read access for
              your frames (see <code className="text-[11px]">.env.example</code> notes).
            </p>
          </div>
        ) : status === "loading" && !displayUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="h-8 w-8 rounded-full border-2 border-white/15 border-t-white/70"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              aria-label="Loading feed"
            />
          </div>
        ) : status === "empty" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-white/65">No media in {bucketName} yet</p>
            <p className="max-w-sm text-xs text-white/40">
              Upload <span className="text-white/55">.mp4</span> (or jpg, png, webp, gif, webm, mov) to the{" "}
              <span className="text-white/55">{bucketName}</span> bucket. The newest file wins. If files are at the
              bucket root, leave <code className="text-white/45">NEXT_PUBLIC_CAMS_PREFIX</code> unset — it is only for
              a subfolder inside the bucket, not the bucket name.
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
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
        ) : displayUrl && frame && !mediaError ? (
          frame.kind === "video" ? (
            <video
              key={displayUrl}
              className="absolute inset-0 z-0 h-full w-full object-cover"
              src={displayUrl}
              autoPlay
              muted
              playsInline
              loop
              onLoadedData={onMediaLoad}
              onError={onMediaError}
            />
          ) : (
            // Dynamic storage URL + cache-bust query — avoid next/image caching stale frames
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={displayUrl}
              alt={`Camera frame ${frame.path}`}
              src={displayUrl}
              className="absolute inset-0 z-0 h-full w-full object-cover"
              onLoad={onMediaLoad}
              onError={onMediaError}
            />
          )
        ) : displayUrl && frame && mediaError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-white/70">Media failed to load</p>
            <p className="text-xs text-white/45">
              Check bucket policies (public read or signed URLs) and CORS. Path:{" "}
              <code className="rounded bg-white/[0.08] px-1 py-0.5 text-[11px]">{frame.path}</code>
            </p>
            <button
              type="button"
              onClick={() => {
                setMediaError(false);
                void refresh();
              }}
              className="mt-1 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white/85"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-white/40">Waiting for feed…</p>
          </div>
        )}

        {status === "ready" && displayUrl && !mediaError ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/50 to-transparent" />
        ) : null}
      </div>
    </GlassPanel>
  );
}
