"use client";

import { getCachedLiveAnalysis, setCachedLiveAnalysis } from "@/lib/analysis-cache";
import type { FrameAnalysis } from "@/lib/types/room";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";

export interface UseLiveAnalysisOptions {
  /**
   * When set, periodically captures the video element and POSTs `/api/analyze-frame`
   * so insights + behavior heatmap track playback in near real time.
   */
  realtimeFrameCaptureMs?: number;
  /** Ref to the specific video element to capture frames from. Required for per-tile analysis. */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export interface UseLiveAnalysisResult {
  status: AnalysisStatus;
  analysis: FrameAnalysis | null;
  error: string | null;
  /** Manually request a re-analysis of the current frame */
  refresh: () => void;
}

/**
 * Analyzes a camera feed when the URL changes (POST /api/analyze).
 * Optional `realtimeFrameCaptureMs`: re-run vision on the **current video frame** on an interval.
 */
export function useLiveAnalysis(
  frameUrl: string | null,
  options?: UseLiveAnalysisOptions,
): UseLiveAnalysisResult {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [analysis, setAnalysis] = useState<FrameAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAnalyzedUrl = useRef<string | null>(null);
  const inFlight = useRef(false);
  const frameUrlRef = useRef<string | null>(frameUrl);
  frameUrlRef.current = frameUrl;
  const frameCaptureInFlight = useRef(false);

  const realtimeMs = options?.realtimeFrameCaptureMs ?? 0;
  const videoElRef = options?.videoRef ?? null;

  // Restore from IndexedDB on mount / URL change
  useEffect(() => {
    if (!frameUrl) return;
    let cancelled = false;
    getCachedLiveAnalysis(frameUrl).then((cached) => {
      if (cancelled || !cached) return;
      // Only restore if we don't already have a result for this URL
      if (lastAnalyzedUrl.current === frameUrl) return;
      setAnalysis(cached);
      setStatus("ready");
      lastAnalyzedUrl.current = frameUrl;
    });
    return () => { cancelled = true; };
  }, [frameUrl]);

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
      doneRef.current = true;
      void setCachedLiveAnalysis(url, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Set to true once we have a successful result — stops all further API calls for this URL. */
  const doneRef = useRef(false);

  const runFrameCaptureAnalysis = useCallback(async () => {
    const url = frameUrlRef.current;
    if (!url || frameCaptureInFlight.current || doneRef.current) return;

    const video = videoElRef?.current
      ?? document.querySelector("video[data-live-frame-capture]") as HTMLVideoElement | null;
    if (!video) return;
    if (!videoElRef && video.dataset.analysisUrl !== url) return;
    if (video.readyState < 2) return;
    if (video.paused) return;

    frameCaptureInFlight.current = true;

    try {
      const canvas = document.createElement("canvas");
      const MAX_W = 640;
      const scale = Math.min(1, MAX_W / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      const base64 = dataUrl.split(",")[1];
      if (!base64 || base64.length < 100) return;

      const res = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, mime_type: "image/jpeg" }),
      });
      if (!res.ok) return;

      const data = (await res.json()) as FrameAnalysis;
      const result = { ...data, frameUrl: url };
      setAnalysis(result);
      setError(null);
      setStatus("ready");
      doneRef.current = true; // Stop further captures
      if (url) void setCachedLiveAnalysis(url, result);
    } catch {
      // soft-fail for background ticks — keep last good analysis
    } finally {
      frameCaptureInFlight.current = false;
    }
  }, []);

  // Analyze once when the URL changes — skip if we already have a result (from cache or prior run)
  useEffect(() => {
    if (!frameUrl) {
      setStatus("idle");
      doneRef.current = false;
      return;
    }
    if (lastAnalyzedUrl.current === frameUrl) {
      doneRef.current = true; // already have data, don't re-fetch
      return;
    }
    doneRef.current = false;
    void runAnalysis(frameUrl);
  }, [frameUrl, runAnalysis]);

  // Frame capture — runs on an interval but stops once doneRef is true
  useEffect(() => {
    if (!realtimeMs || !frameUrl || realtimeMs < 500) return;

    const kickoff = window.setTimeout(() => {
      if (!doneRef.current) void runFrameCaptureAnalysis();
    }, 1200);

    const id = window.setInterval(() => {
      if (!doneRef.current) void runFrameCaptureAnalysis();
    }, realtimeMs);

    return () => {
      clearTimeout(kickoff);
      clearInterval(id);
    };
  }, [frameUrl, realtimeMs, runFrameCaptureAnalysis]);

  const refresh = useCallback(() => {
    if (frameUrl) {
      lastAnalyzedUrl.current = null; // force re-run
      void runAnalysis(frameUrl);
    }
  }, [frameUrl, runAnalysis]);

  return { status, analysis, error, refresh };
}
