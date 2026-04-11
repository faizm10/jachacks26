"use client";

import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { useCallback, useEffect, useState } from "react";

export type CamsFeedStatus = "loading" | "ready" | "empty" | "error";

export interface UseCamsAllFeedsResult {
  status: CamsFeedStatus;
  objects: CamsLatestObject[];
  error: string | null;
  refresh: () => void;
}

function pollMs(): number {
  const raw = process.env.NEXT_PUBLIC_CAMS_POLL_INTERVAL_MS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 2000 ? n : 5000;
}

export function useCamsAllFeeds(): UseCamsAllFeedsResult {
  const [status, setStatus] = useState<CamsFeedStatus>("loading");
  const [objects, setObjects] = useState<CamsLatestObject[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const res = await fetch("/api/cams");
      const json = await res.json() as { objects?: CamsLatestObject[]; error?: string };

      if (!res.ok || json.error) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      const all = json.objects ?? [];
      setObjects(all);
      setStatus(all.length === 0 ? "empty" : "ready");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load camera bucket";
      setError(message);
      setObjects([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), pollMs());
    return () => window.clearInterval(id);
  }, [load]);

  return { status, objects, error, refresh: load };
}
