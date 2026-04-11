"use client";

import { fetchLatestCamsObject } from "@/lib/supabase/cams-bucket";
import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CamsFeedStatus = "unconfigured" | "loading" | "ready" | "empty" | "error";

export interface UseCamsBucketFeedResult {
  status: CamsFeedStatus;
  frame: CamsLatestObject | null;
  /** URL with cache-bust so replaced objects reload in the browser */
  displayUrl: string | null;
  error: string | null;
  refresh: () => void;
}

function pollMs(): number {
  const raw = process.env.NEXT_PUBLIC_CAMS_POLL_INTERVAL_MS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 2000 ? n : 5000;
}

export function useCamsBucketFeed(): UseCamsBucketFeedResult {
  const [status, setStatus] = useState<CamsFeedStatus>(() =>
    isSupabaseConfigured() ? "loading" : "unconfigured",
  );
  const [frame, setFrame] = useState<CamsLatestObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      firstLoad.current = true;
      setStatus("unconfigured");
      setFrame(null);
      setError(null);
      return;
    }

    if (firstLoad.current) {
      setStatus("loading");
    }
    setError(null);

    try {
      const client = getSupabaseBrowserClient();
      const latest = await fetchLatestCamsObject(client);
      firstLoad.current = false;

      if (!latest) {
        setFrame(null);
        setStatus("empty");
        return;
      }

      setFrame(latest);
      setRevision((n) => n + 1);
      setStatus("ready");
    } catch (e) {
      firstLoad.current = false;
      const message = e instanceof Error ? e.message : "Failed to load cams bucket";
      setError(message);
      setFrame(null);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const id = window.setInterval(() => void load(), pollMs());
    return () => window.clearInterval(id);
  }, [load]);

  const displayUrl = useMemo(() => {
    if (!frame) return null;
    const sep = frame.url.includes("?") ? "&" : "?";
    return `${frame.url}${sep}_rid=${revision}`;
  }, [frame, revision]);

  return {
    status,
    frame,
    displayUrl,
    error,
    refresh: load,
  };
}
