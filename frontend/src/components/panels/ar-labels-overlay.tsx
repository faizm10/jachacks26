"use client";

import type { DetectedPerson, FrameAnalysis } from "@/lib/types/room";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── Tracking types ── */

interface TrackedPerson {
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  missedFrames: number;
  age: number;
  activity: string;
}

/* ── Stabilization ── */

const SMOOTHING = 0.5;
const MAX_MISSED = 15;
const MIN_AGE = 3;
const IOU_THRESHOLD = 0.1;

function iou(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface RawDet {
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

function updateTracks(tracks: TrackedPerson[], raw: RawDet[]): TrackedPerson[] {
  const matched = new Set<number>();
  const out: TrackedPerson[] = [];

  for (const t of tracks) {
    let best = -1;
    let bestS = IOU_THRESHOLD;
    for (let i = 0; i < raw.length; i++) {
      if (matched.has(i)) continue;
      const s = iou(t.bbox, raw[i].bbox);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best >= 0) {
      const d = raw[best];
      matched.add(best);
      out.push({
        bbox: {
          x: lerp(d.bbox.x, t.bbox.x, SMOOTHING),
          y: lerp(d.bbox.y, t.bbox.y, SMOOTHING),
          w: lerp(d.bbox.w, t.bbox.w, SMOOTHING),
          h: lerp(d.bbox.h, t.bbox.h, SMOOTHING),
        },
        confidence: d.confidence,
        missedFrames: 0,
        age: t.age + 1,
        activity: t.activity,
      });
    } else if (t.missedFrames < MAX_MISSED) {
      out.push({ ...t, missedFrames: t.missedFrames + 1, age: t.age + 1 });
    }
  }

  for (let i = 0; i < raw.length; i++) {
    if (matched.has(i)) continue;
    out.push({
      bbox: { ...raw[i].bbox },
      confidence: raw[i].confidence,
      missedFrames: 0,
      age: 1,
      activity: "detected",
    });
  }
  return out;
}

/* ── Model loader ── */

let cocoModelPromise: Promise<any> | null = null;
async function loadCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load();
    })();
  }
  return cocoModelPromise;
}

/* ── Canvas drawing ── */

const EMERALD = "rgb(52, 211, 153)";
const EMERALD_SEMI = "rgba(52, 211, 153, 0.7)";
const LABEL_BG = "rgba(0, 0, 0, 0.8)";
const CORNER_LEN = 10;

function drawTracks(
  ctx: CanvasRenderingContext2D,
  tracks: TrackedPerson[],
  cw: number,
  ch: number,
) {
  ctx.clearRect(0, 0, cw, ch);

  const visible = tracks.filter((t) => t.age >= MIN_AGE);

  for (let i = 0; i < visible.length; i++) {
    const t = visible[i];
    const x = t.bbox.x * cw;
    const y = t.bbox.y * ch;
    const w = t.bbox.w * cw;
    const h = t.bbox.h * ch;
    const alpha = t.missedFrames === 0 ? 1 : Math.max(0.3, 1 - t.missedFrames * 0.08);

    ctx.globalAlpha = alpha;

    // Box
    ctx.strokeStyle = EMERALD_SEMI;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Glow
    ctx.shadowColor = EMERALD;
    ctx.shadowBlur = 8;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;

    // Corner accents
    ctx.strokeStyle = EMERALD;
    ctx.lineWidth = 3;
    // TL
    ctx.beginPath(); ctx.moveTo(x, y + CORNER_LEN); ctx.lineTo(x, y); ctx.lineTo(x + CORNER_LEN, y); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + CORNER_LEN); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(x, y + h - CORNER_LEN); ctx.lineTo(x, y + h); ctx.lineTo(x + CORNER_LEN, y + h); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - CORNER_LEN); ctx.stroke();

    // Activity label above box
    const label = `${t.activity}  ${Math.round(t.confidence * 100)}%`;
    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    const metrics = ctx.measureText(label);
    const lw = metrics.width + 16;
    const lh = 22;
    const lx = x + w / 2 - lw / 2;
    const ly = y - lh - 6;

    // Label background pill
    ctx.fillStyle = LABEL_BG;
    ctx.beginPath();
    const r = lh / 2;
    ctx.roundRect(lx, ly, lw, lh, r);
    ctx.fill();
    ctx.strokeStyle = EMERALD_SEMI;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, r);
    ctx.stroke();

    // Pulsing dot
    ctx.fillStyle = EMERALD;
    ctx.beginPath();
    ctx.arc(lx + 10, ly + lh / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label text
    ctx.fillStyle = "rgb(110, 231, 183)";
    ctx.fillText(label, lx + 18, ly + lh / 2 + 4);

    // Person number badge
    const badgeR = 9;
    const bx = x - 4;
    const by = y - 4;
    ctx.fillStyle = "rgb(52, 211, 153)";
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), bx, by);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    ctx.globalAlpha = 1;
  }
}

/* ── Main component ── */

export interface ARLabelsOverlayProps {
  videoUrl: string | null;
  persons: DetectedPerson[];
  analyzing?: boolean;
}

export function ARLabelsOverlay({ videoUrl }: ARLabelsOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tracksRef = useRef<TrackedPerson[]>([]);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const hasVideo = !!videoUrl;

  const [modelReady, setModelReady] = useState(false);
  const [personCount, setPersonCount] = useState(0);
  const [sceneDescription, setSceneDescription] = useState("");

  // Load model
  useEffect(() => {
    if (!hasVideo) return;
    let cancelled = false;
    loadCocoModel().then((m) => {
      if (!cancelled) { modelRef.current = m; setModelReady(true); }
    });
    return () => { cancelled = true; };
  }, [hasVideo]);

  // Detection + draw loop — runs entirely outside React render cycle
  useEffect(() => {
    if (!hasVideo || !modelReady) return;

    let lastCountUpdate = 0;

    const loop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;

      if (!video || !canvas || !model || video.readyState < 2 || video.paused) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Size canvas to match video display size
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      try {
        const preds = await model.detect(video);
        const raw: RawDet[] = preds
          .filter((p: any) => p.class === "person" && p.score > 0.3)
          .map((p: any) => ({
            bbox: {
              x: p.bbox[0] / video.videoWidth,
              y: p.bbox[1] / video.videoHeight,
              w: p.bbox[2] / video.videoWidth,
              h: p.bbox[3] / video.videoHeight,
            },
            confidence: p.score,
          }));

        tracksRef.current = updateTracks(tracksRef.current, raw);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          drawTracks(ctx, tracksRef.current, canvas.width, canvas.height);
        }

        // Update React state for the header count — throttled to avoid re-renders
        const now = Date.now();
        if (now - lastCountUpdate > 500) {
          const count = tracksRef.current.filter((t) => t.age >= MIN_AGE).length;
          setPersonCount(count);
          lastCountUpdate = now;
        }
      } catch {
        // skip
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hasVideo, modelReady]);

  // Gemini activity labels — updates track activities periodically
  const geminiCanvas = useRef<HTMLCanvasElement | null>(null);
  const inFlight = useRef(false);

  const analyzeActivities = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || inFlight.current) return;

    if (!geminiCanvas.current) geminiCanvas.current = document.createElement("canvas");
    const c = geminiCanvas.current;
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const base64 = c.toDataURL("image/jpeg", 0.6).split(",")[1];
    if (!base64) return;

    inFlight.current = true;
    try {
      const res = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, mime_type: "image/jpeg" }),
      });
      if (res.ok) {
        const data = (await res.json()) as FrameAnalysis;
        // Assign activities to tracked persons by index
        const tracks = tracksRef.current;
        const visible = tracks.filter((t) => t.age >= MIN_AGE);
        for (let i = 0; i < visible.length && i < data.persons.length; i++) {
          visible[i].activity = data.persons[i].activity;
        }
        setSceneDescription(data.sceneDescription);
      }
    } catch {
      // skip
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hasVideo) { setSceneDescription(""); return; }
    const id = window.setInterval(() => void analyzeActivities(), 6000);
    // Initial after a short delay for video to load
    const t = window.setTimeout(() => void analyzeActivities(), 2000);
    return () => { window.clearInterval(id); window.clearTimeout(t); };
  }, [hasVideo, analyzeActivities]);

  // Reset on deselect
  useEffect(() => {
    if (!hasVideo) {
      tracksRef.current = [];
      setPersonCount(0);
      setSceneDescription("");
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [hasVideo]);

  return (
    <GlassPanel className="relative overflow-hidden p-5">
      <SectionHeader
        title="AR labels"
        subtitle={
          personCount > 0
            ? `${personCount} detection${personCount !== 1 ? "s" : ""} · real-time tracking`
            : hasVideo && !modelReady
              ? "Loading detection model…"
              : hasVideo
                ? "Scanning for people…"
                : "Select a feed to begin"
        }
        action={
          <div className="flex items-center gap-2">
            {hasVideo && (
              <span
                className={`h-2 w-2 rounded-full ${
                  modelReady ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"
                }`}
              />
            )}
            {personCount > 0 ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
                {personCount} people
              </span>
            ) : null}
          </div>
        }
      />

      {sceneDescription && (
        <p className="mt-1 text-[11px] text-white/40">{sceneDescription}</p>
      )}

      <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/60">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              key={videoUrl}
              className="h-full w-full object-contain"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              loop
              crossOrigin="anonymous"
            />
            {/* Canvas overlay — drawn directly, no React re-renders */}
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="text-2xl text-white/15">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <p className="text-xs text-white/30">Select a camera feed to see detections</p>
          </div>
        )}

        {hasVideo && !modelReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2">
              <motion.div
                className="h-4 w-4 rounded-full border-2 border-white/20 border-t-emerald-400"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-xs text-white/60">Loading detection model…</span>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
