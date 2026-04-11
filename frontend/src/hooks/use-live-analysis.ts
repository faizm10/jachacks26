"use client";

import type { FrameAnalysis } from "@/lib/types/room";
import { useCallback, useEffect, useRef, useState } from "react";

export type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";

export interface UseLiveAnalysisResult {
  status: AnalysisStatus;
  analysis: FrameAnalysis | null;
  error: string | null;
  /** Manually request a re-analysis of the current frame */
  refresh: () => void;
}

/**
 * Analyzes a camera feed on demand — only when the URL changes (user selects a feed).
 * No automatic polling. Call `refresh()` to re-analyze the same feed.
 */
export function useLiveAnalysis(frameUrl: string | null): UseLiveAnalysisResult {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [analysis, setAnalysis] = useState<FrameAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAnalyzedUrl = useRef<string | null>(null);
  const inFlight = useRef(false);

  const runAnalysis = useCallback(async (url: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("analyzing");
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_url: url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as FrameAnalysis;
      setAnalysis(data);
      setStatus("ready");
      lastAnalyzedUrl.current = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Analyze once when the user selects a different feed
  useEffect(() => {
    if (!frameUrl) {
      // Deselected — reset to idle but keep last analysis visible
      setStatus("idle");
      return;
    }
    if (frameUrl !== lastAnalyzedUrl.current) {
      void runAnalysis(frameUrl);
    }
  }, [frameUrl, runAnalysis]);

  const refresh = useCallback(() => {
    if (frameUrl) {
      lastAnalyzedUrl.current = null; // force re-run
      void runAnalysis(frameUrl);
    }
  }, [frameUrl, runAnalysis]);

  return { status, analysis, error, refresh };
}
