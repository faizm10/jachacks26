"use client";

import type {
  DetectedObject,
  ObjectDetection as CocoObjectDetector,
} from "@tensorflow-models/coco-ssd";
import { getActivityLabelTheme, isLockedInActivity } from "@/lib/ar-label-activity-colors";
import type { DetectedPerson } from "@/lib/types/room";
import { ArLabelColorLegend } from "@/components/panels/ar-label-color-legend";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Architecture
//
// COCO-SSD  →  real-time bbox detection on every frame (smooth, no cap)
//    ↓ IoU tracking
// Stable tracks with persistent IDs (P1, P2, …)
//    ↑ label injection
// Gemini  →  activity labels only, matched to nearest stable track by bbox IoU
//            (labels from one clip-level analysis; stick while you scrub / loop)
// ---------------------------------------------------------------------------

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VideoTransportBar({
  videoRef,
  videoUrl,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string;
}) {
  const [snap, setSnap] = useState({
    currentTime: 0,
    duration: 0,
    paused: true,
    muted: true,
    playbackRate: 1,
  });
  const scrubbing = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      if (scrubbing.current) return;
      setSnap({
        currentTime: v.currentTime,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        paused: v.paused,
        muted: v.muted,
        playbackRate: v.playbackRate,
      });
    };
    sync();
    const evs = ["timeupdate", "play", "pause", "loadedmetadata", "durationchange", "ratechange", "volumechange"] as const;
    evs.forEach((e) => v.addEventListener(e, sync));
    return () => evs.forEach((e) => v.removeEventListener(e, sync));
  }, [videoRef, videoUrl]);

  const dur = snap.duration > 0 ? snap.duration : 1;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-black/60 px-2.5 py-2 sm:px-3">
      <button
        type="button"
        aria-label={snap.paused ? "Play" : "Pause"}
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/90 transition-colors hover:bg-white/[0.1]"
      >
        {snap.paused ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        )}
      </button>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label="Back 10 seconds"
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            el.currentTime = Math.max(0, el.currentTime - 10);
          }}
          className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/70 hover:bg-white/[0.08]"
        >
          −10s
        </button>
        <button
          type="button"
          aria-label="Forward 10 seconds"
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            const end = Number.isFinite(el.duration) ? el.duration : el.currentTime + 10;
            el.currentTime = Math.min(end, el.currentTime + 10);
          }}
          className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/70 hover:bg-white/[0.08]"
        >
          +10s
        </button>
      </div>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={dur}
        step={0.05}
        value={Math.min(snap.currentTime, dur)}
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={() => {
          scrubbing.current = false;
          const el = videoRef.current;
          if (el) {
            setSnap((s) => ({
              ...s,
              currentTime: el.currentTime,
              duration: Number.isFinite(el.duration) ? el.duration : s.duration,
              paused: el.paused,
            }));
          }
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
        onChange={(e) => {
          const el = videoRef.current;
          if (!el) return;
          const t = Number(e.target.value);
          el.currentTime = t;
          setSnap((s) => ({ ...s, currentTime: t }));
        }}
        className="h-1 min-w-[72px] flex-1 cursor-pointer accent-emerald-400"
      />
      <span className="shrink-0 tabular-nums text-[11px] text-white/55">
        {formatMediaTime(snap.currentTime)} / {formatMediaTime(snap.duration)}
      </span>
      <button
        type="button"
        aria-label={snap.muted ? "Unmute" : "Mute"}
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          el.muted = !el.muted;
          setSnap((s) => ({ ...s, muted: el.muted }));
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.1]"
      >
        {snap.muted ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a9 9 0 010 14.14" />
          </svg>
        )}
      </button>
      <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/45">
        <span className="hidden sm:inline">Speed</span>
        <select
          aria-label="Playback speed"
          value={String(snap.playbackRate)}
          onChange={(e) => {
            const el = videoRef.current;
            if (!el) return;
            el.playbackRate = Number(e.target.value);
            setSnap((s) => ({ ...s, playbackRate: el.playbackRate }));
          }}
          className="rounded-md border border-white/12 bg-black/50 py-1 pl-2 pr-7 text-[11px] text-white/85 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
        >
          {["0.5", "0.75", "1", "1.25", "1.5", "2"].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export interface StableTrack {
  stableId: string;
  bbox: { x: number; y: number; w: number; h: number };
  activity: string;       // injected from Gemini; "detected" until first label
  confidence: number;
  missedFrames: number;
  age: number;
  seenAt: number;
}

// ── IoU helper ──────────────────────────────────────────────────────────────

function iouBbox(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function bboxAreaNorm(b: { x: number; y: number; w: number; h: number }): number {
  return b.w * b.h;
}

/**
 * COCO often emits one giant "person" over a crowd. Drop boxes that cover too much of the frame,
 * bad aspect ratios, and "megaboxes" that contain multiple smaller person detections.
 */
function filterImplausiblePersonBoxes(raw: RawDet[]): RawDet[] {
  const MAX_AREA = 0.26;
  const MIN_SIDE = 0.022;
  const MIN_AR = 0.12;
  const MAX_AR = 7;

  let dets = raw.filter((d) => {
    const a = bboxAreaNorm(d.bbox);
    if (a > MAX_AREA) return false;
    if (d.bbox.w < MIN_SIDE || d.bbox.h < MIN_SIDE) return false;
    const ar = d.bbox.w / Math.max(d.bbox.h, 1e-6);
    if (ar < MIN_AR || ar > MAX_AR) return false;
    return true;
  });

  const areas = dets.map((d) => bboxAreaNorm(d.bbox));
  const drop = new Set<number>();
  for (let i = 0; i < dets.length; i++) {
    if (areas[i] < 0.085) continue;
    const B = dets[i].bbox;
    let inner = 0;
    for (let j = 0; j < dets.length; j++) {
      if (i === j) continue;
      if (areas[j] >= areas[i] * 0.52) continue;
      const C = dets[j].bbox;
      const cx = C.x + C.w / 2;
      const cy = C.y + C.h / 2;
      if (cx < B.x || cx > B.x + B.w || cy < B.y || cy > B.y + B.h) continue;
      inner++;
    }
    if (inner >= 2) drop.add(i);
  }
  dets = dets.filter((_, i) => !drop.has(i));

  return dets;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── COCO-SSD tracking (runs every frame) ───────────────────────────────────

const SMOOTHING    = 0.45;   // bbox lerp — lower = snappier
const MAX_MISSED   = 12;     // frames before a track is dropped
const MIN_AGE      = 2;      // frames before a track is drawn
const IOU_THRESH   = 0.10;   // min IoU to match detection → track
let _nextId = 1;

interface RawDet { bbox: { x: number; y: number; w: number; h: number }; confidence: number; }

function updateTracks(tracks: StableTrack[], raw: RawDet[]): StableTrack[] {
  const matched = new Set<number>();
  const out: StableTrack[] = [];
  const now = Date.now();

  for (const t of tracks) {
    let best = -1, bestS = IOU_THRESH;
    for (let i = 0; i < raw.length; i++) {
      if (matched.has(i)) continue;
      const s = iouBbox(t.bbox, raw[i].bbox);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best >= 0) {
      const d = raw[best];
      matched.add(best);
      out.push({
        ...t,
        bbox: {
          x: lerp(d.bbox.x, t.bbox.x, SMOOTHING),
          y: lerp(d.bbox.y, t.bbox.y, SMOOTHING),
          w: lerp(d.bbox.w, t.bbox.w, SMOOTHING),
          h: lerp(d.bbox.h, t.bbox.h, SMOOTHING),
        },
        confidence: d.confidence,
        missedFrames: 0,
        age: t.age + 1,
        seenAt: now,
      });
    } else if (t.missedFrames < MAX_MISSED) {
      out.push({ ...t, missedFrames: t.missedFrames + 1, age: t.age + 1 });
    }
  }

  for (let i = 0; i < raw.length; i++) {
    if (!matched.has(i)) {
      out.push({
        stableId: `P${_nextId++}`,
        bbox: { ...raw[i].bbox },
        confidence: raw[i].confidence,
        missedFrames: 0,
        age: 1,
        activity: "detected",
        seenAt: Date.now(),
      });
    }
  }
  return out;
}

// ── Gemini label injection (runs every ~3.2 s) ─────────────────────────────
// Match each Gemini person to the nearest COCO-SSD stable track by IoU.
// The track keeps the label across frames since the track ID is stable.

function injectGeminiLabels(tracks: StableTrack[], geminiPersons: DetectedPerson[]): StableTrack[] {
  if (!geminiPersons.length) return tracks;
  const used = new Set<number>();
  return tracks.map((t) => {
    let best = -1, bestIou = 0.10; // min overlap to assign label
    for (let i = 0; i < geminiPersons.length; i++) {
      if (used.has(i)) continue;
      const s = iouBbox(t.bbox, geminiPersons[i].bbox);
      if (s > bestIou) { bestIou = s; best = i; }
    }
    if (best >= 0) {
      used.add(best);
      return { ...t, activity: geminiPersons[best].activity };
    }
    return t;
  });
}

// ── COCO-SSD loader ────────────────────────────────────────────────────────

let cocoModelPromise: Promise<CocoObjectDetector> | null = null;
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

// ── Canvas drawing ─────────────────────────────────────────────────────────

const EMERALD      = "rgb(52, 211, 153)";
const EMERALD_SEMI = "rgba(52, 211, 153, 0.7)";
const AMBER        = "rgb(251, 191, 36)";
const AMBER_SEMI   = "rgba(251, 191, 36, 0.6)";
const VIOLET       = "rgb(139, 92, 246)";
const VIOLET_SEMI  = "rgba(139, 92, 246, 0.6)";
const LABEL_BG     = "rgba(0,0,0,0.82)";
const CORNER_LEN   = 10;
let _frameCount    = 0;

function drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath(); ctx.moveTo(x, y + CORNER_LEN); ctx.lineTo(x, y); ctx.lineTo(x + CORNER_LEN, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + CORNER_LEN); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + h - CORNER_LEN); ctx.lineTo(x, y + h); ctx.lineTo(x + CORNER_LEN, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - CORNER_LEN); ctx.stroke();
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  tracks: StableTrack[],
  highlightId: string | null,
  geminiReady: boolean,
) {
  ctx.clearRect(0, 0, cw, ch);
  _frameCount++;

  const visible = tracks.filter((t) => t.age >= MIN_AGE);

  for (const t of visible) {
    const x = t.bbox.x * cw;
    const y = t.bbox.y * ch;
    const w = t.bbox.w * cw;
    const h = t.bbox.h * ch;
    if (w < 6 || h < 6) continue;

    const alpha      = t.missedFrames === 0 ? 1 : Math.max(0.3, 1 - t.missedFrames * 0.08);
    const hasLabel   = t.activity !== "detected";
    const isSending  = !hasLabel && geminiReady === false;
    const hi         = t.stableId === highlightId;
    const theme      = hasLabel ? getActivityLabelTheme(t.activity) : null;

    const box    = hi ? VIOLET_SEMI  : isSending ? AMBER_SEMI  : (theme?.boxSemi  ?? EMERALD_SEMI);
    const accent = hi ? VIOLET       : isSending ? AMBER       : (theme?.accent   ?? EMERALD);
    const txtClr = hi ? "rgb(196,181,253)" : isSending ? "rgb(253,224,71)" : (theme?.text ?? "rgb(110,231,183)");

    ctx.globalAlpha = alpha;

    // Box
    ctx.strokeStyle = box; ctx.lineWidth = hi ? 2.5 : 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowColor = accent; ctx.shadowBlur = hi ? 14 : 6;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;

    // Corners
    ctx.strokeStyle = accent; ctx.lineWidth = hi ? 3 : 2.5;
    drawCorners(ctx, x, y, w, h);

    // Label pill — only when box is large enough to not clutter
    const showLabel = w > 50 || hi;
    if (showLabel) {
      let label: string;
      if (hasLabel) {
        label = `${t.activity}  ${Math.round(t.confidence * 100)}%`;
      } else if (isSending) {
        const dots = ".".repeat((Math.floor(_frameCount / 20) % 3) + 1);
        label = `analyzing${dots}`;
      } else {
        label = "person";
      }

      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      const lw = ctx.measureText(label).width + (isSending ? 28 : 22);
      const lh = 22;
      const lx = Math.max(2, Math.min(cw - lw - 2, x + w / 2 - lw / 2));
      const ly = y >= 30 ? y - 28 : Math.min(ch - lh - 2, y + h + 6);

      ctx.fillStyle = LABEL_BG;
      ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, lh / 2); ctx.fill();
      ctx.strokeStyle = box; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, lh / 2); ctx.stroke();

      if (isSending) {
        const ang = (_frameCount * 0.08) % (Math.PI * 2);
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(lx + 10, ly + lh / 2, 4, ang, ang + Math.PI * 1.4); ctx.stroke();
      } else {
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(lx + 10, ly + lh / 2, 3, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = txtClr;
      ctx.fillText(label, lx + (isSending ? 20 : 17), ly + lh / 2 + 4);
    }

    // Badge number
    const num = t.stableId.replace(/\D/g, "");
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "black";
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(num, x - 4, y - 4);
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";

    ctx.globalAlpha = 1;
  }

  // Bottom shimmer bar while Gemini is analyzing
  if (!geminiReady && visible.length > 0) {
    const sw = cw * 0.25;
    const sx = ((_frameCount * 2) % (cw + sw)) - sw;
    ctx.globalAlpha = 0.45;
    const grad = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, AMBER);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, ch - 3, cw, 3);
    ctx.globalAlpha = 1;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export interface ARLabelsOverlayProps {
  videoUrl: string | null;
  /** Gemini persons — used for activity labels only, matched to COCO tracks */
  persons: DetectedPerson[];
  analyzing?: boolean;
  liveSceneSummary?: string;
  highlightedPersonId?: string | null;
  onStableTracks?: (tracks: StableTrack[]) => void;
}

export function ARLabelsOverlay({
  videoUrl,
  persons,
  highlightedPersonId = null,
  onStableTracks,
}: ARLabelsOverlayProps) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef    = useRef<number | null>(null);
  const modelRef  = useRef<CocoObjectDetector | null>(null);

  const expandedVideoRef  = useRef<HTMLVideoElement | null>(null);
  const expandedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedRafRef    = useRef<number | null>(null);

  const [expanded,    setExpanded]    = useState(false);
  const [modelReady,  setModelReady]  = useState(false);
  const [personCount, setPersonCount] = useState(0);
  const [lockedIn,    setLockedIn]    = useState(false);

  // Tracks live in a ref — updated every frame outside React render cycle
  const tracksRef      = useRef<StableTrack[]>([]);
  const geminiReadyRef = useRef(false);
  // Latest Gemini persons cached for label injection
  const geminiPersonsRef = useRef<DetectedPerson[]>([]);

  const hasVideo = !!videoUrl;

  // ── Inject Gemini labels whenever persons prop updates
  useEffect(() => {
    if (!persons.length) {
      geminiPersonsRef.current = [];
      geminiReadyRef.current = false;
      // Strip injected activities so old clip labels never stick on new COCO boxes
      if (tracksRef.current.length > 0) {
        tracksRef.current = tracksRef.current.map((t) => ({ ...t, activity: "detected" }));
        onStableTracks?.(tracksRef.current);
      }
      return;
    }
    geminiPersonsRef.current = persons;
    geminiReadyRef.current = true;
    // Immediately re-inject labels into current tracks
    tracksRef.current = injectGeminiLabels(tracksRef.current, persons);
    onStableTracks?.(tracksRef.current);
  }, [persons, onStableTracks]);

  // ── Reset on video change (module _nextId otherwise keeps counting → P7 on a fresh clip)
  useEffect(() => {
    _nextId = 1;
    tracksRef.current = [];
    geminiPersonsRef.current = [];
    geminiReadyRef.current = false;
    setPersonCount(0);
    setLockedIn(false);
    onStableTracks?.([]);
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [videoUrl, onStableTracks]);

  // ── Load COCO-SSD
  useEffect(() => {
    if (!hasVideo) return;
    let cancelled = false;
    loadCocoModel().then((m) => { if (!cancelled) { modelRef.current = m; setModelReady(true); } });
    return () => { cancelled = true; };
  }, [hasVideo]);

  // ── Detection + draw loop (real-time, every frame)
  useEffect(() => {
    if (!hasVideo || !modelReady) return;
    let lastCountUpdate = 0;

    const loop = async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      const model  = modelRef.current;

      if (!video || !canvas || !model || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop); return;
      }

      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width; canvas.height = rect.height;
      }

      try {
        // Real-time COCO-SSD detection
        const preds = await model.detect(video);
        const raw: RawDet[] = filterImplausiblePersonBoxes(
          preds
            .filter((p: DetectedObject) => p.class === "person" && p.score > 0.30)
            .map((p: DetectedObject) => ({
              bbox: {
                x: p.bbox[0] / video.videoWidth,
                y: p.bbox[1] / video.videoHeight,
                w: p.bbox[2] / video.videoWidth,
                h: p.bbox[3] / video.videoHeight,
              },
              confidence: p.score,
            })),
        );

        // Update stable tracks with IoU matching + smoothing
        tracksRef.current = updateTracks(tracksRef.current, raw);

        // Re-inject Gemini labels after every track update
        if (geminiPersonsRef.current.length > 0) {
          tracksRef.current = injectGeminiLabels(tracksRef.current, geminiPersonsRef.current);
        }

        // Draw
        const ctx = canvas.getContext("2d");
        if (ctx) {
          drawTracks(ctx, canvas.width, canvas.height, tracksRef.current, highlightedPersonId, geminiReadyRef.current);
        }

        // Update React state (throttled)
        const now = Date.now();
        if (now - lastCountUpdate > 500) {
          const visible = tracksRef.current.filter((t) => t.age >= MIN_AGE);
          setPersonCount(visible.length);
          setLockedIn(visible.some((t) => t.activity !== "detected" && isLockedInActivity(t.activity)));
          onStableTracks?.(tracksRef.current);
          lastCountUpdate = now;
        }
      } catch { /* skip frame on error */ }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [hasVideo, modelReady, highlightedPersonId, onStableTracks]);

  return (
    <GlassPanel className="relative overflow-hidden p-5">
      <SectionHeader
        title="AR labels"
        subtitle={
          personCount > 0
            ? `${personCount} detection${personCount !== 1 ? "s" : ""} · real-time tracking`
            : hasVideo && !modelReady ? "Loading detection model…"
            : hasVideo ? "Scanning for people…"
            : "Select a feed to begin"
        }
        action={
          <div className="flex items-center gap-2">
            {hasVideo && (
              <span className={`h-2 w-2 rounded-full ${modelReady ? lockedIn ? "bg-pink-400 animate-pulse" : "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"}`} />
            )}
            {personCount > 0 && (
              <span className={lockedIn
                ? "rounded-full border border-pink-400/30 bg-pink-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-pink-200/95"
                : "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90"
              }>{personCount} people</span>
            )}
          </div>
        }
      />

      <ArLabelColorLegend />

      <div className="relative mt-3 w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/60">
        {hasVideo ? (
          <>
            <div className="relative aspect-video w-full">
            <video ref={videoRef} key={videoUrl} className="h-full w-full object-contain"
              src={videoUrl} autoPlay muted playsInline loop crossOrigin="anonymous" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <button type="button" onClick={() => { videoRef.current?.pause(); setExpanded(true); }}
              className="absolute right-3 top-3 rounded-lg border border-white/15 bg-black/60 p-1.5 text-white/60 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white/90"
              title="Expand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
            </div>
            <VideoTransportBar videoRef={videoRef} videoUrl={videoUrl!} />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="text-white/15">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <p className="text-xs text-white/30">Select a camera feed to see detections</p>
          </div>
        )}
        {hasVideo && !modelReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2">
              <motion.div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-emerald-400"
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
              <span className="text-xs text-white/60">Loading detection model…</span>
            </div>
          </div>
        )}
      </div>

      {expanded && hasVideo && typeof document !== "undefined" && createPortal(
        <ExpandedARModal
          videoUrl={videoUrl!}
          mainVideoRef={videoRef}
          tracksRef={tracksRef}
          geminiReadyRef={geminiReadyRef}
          highlightedPersonId={highlightedPersonId}
          expandedVideoRef={expandedVideoRef}
          expandedCanvasRef={expandedCanvasRef}
          expandedRafRef={expandedRafRef}
          personCount={personCount}
          onClose={() => {
            const main = videoRef.current;
            const ex = expandedVideoRef.current;
            if (main && ex && Number.isFinite(ex.currentTime)) {
              main.currentTime = ex.currentTime;
              main.playbackRate = ex.playbackRate;
              main.muted = ex.muted;
            }
            void main?.play().catch(() => {});
            setExpanded(false);
          }}
        />,
        document.body,
      )}
    </GlassPanel>
  );
}

// ── Expanded modal ─────────────────────────────────────────────────────────

function ExpandedARModal({
  videoUrl,
  mainVideoRef,
  tracksRef,
  geminiReadyRef,
  highlightedPersonId,
  expandedVideoRef,
  expandedCanvasRef,
  expandedRafRef,
  personCount,
  onClose,
}: {
  videoUrl: string;
  mainVideoRef: RefObject<HTMLVideoElement | null>;
  tracksRef: RefObject<StableTrack[]>;
  geminiReadyRef: RefObject<boolean>;
  highlightedPersonId: string | null;
  expandedVideoRef: RefObject<HTMLVideoElement | null>;
  expandedCanvasRef: RefObject<HTMLCanvasElement | null>;
  expandedRafRef: RefObject<number | null>;
  personCount: number;
  onClose: () => void;
}) {
  useLayoutEffect(() => {
    const main = mainVideoRef.current;
    const ex = expandedVideoRef.current;
    if (!ex) return;
    const syncFromMain = () => {
      if (main && Number.isFinite(main.currentTime)) {
        try {
          ex.currentTime = main.currentTime;
        } catch {
          /* ignore seek errors on edge frames */
        }
        ex.playbackRate = main.playbackRate;
        ex.muted = main.muted;
      }
    };
    if (ex.readyState >= 1) {
      syncFromMain();
      void ex.play().catch(() => {});
    } else {
      const once = () => {
        syncFromMain();
        void ex.play().catch(() => {});
      };
      ex.addEventListener("loadedmetadata", once, { once: true });
    }
  }, [mainVideoRef, expandedVideoRef, videoUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    const loop = () => {
      const video  = expandedVideoRef.current;
      const canvas = expandedCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        expandedRafRef.current = requestAnimationFrame(loop); return;
      }
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width; canvas.height = rect.height;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawTracks(ctx, canvas.width, canvas.height, tracksRef.current, highlightedPersonId, geminiReadyRef.current);
      }
      expandedRafRef.current = requestAnimationFrame(loop);
    };
    expandedRafRef.current = requestAnimationFrame(loop);
    return () => { if (expandedRafRef.current) cancelAnimationFrame(expandedRafRef.current); };
  }, [tracksRef, geminiReadyRef, highlightedPersonId, expandedVideoRef, expandedCanvasRef, expandedRafRef]);

  return (
    <motion.div role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" aria-hidden />
      <motion.div role="dialog" aria-modal="true" aria-label="Expanded AR labels view"
        className="relative z-10 flex max-h-[min(94vh,960px)] w-full max-w-[min(96vw,1400px)] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgba(6,8,12,0.95)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-white/90">AR Labels — Expanded</p>
            {personCount > 0 && (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                {personCount} people
              </span>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.1]">
            Close
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-black/50 p-3 sm:p-5">
          <div className="relative w-full max-w-full">
            <video ref={expandedVideoRef} className="max-h-[min(78vh,800px)] w-full rounded-lg object-contain"
              src={videoUrl} autoPlay muted playsInline loop crossOrigin="anonymous" />
            <canvas ref={expandedCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full rounded-lg" />
          </div>
          <div className="mt-3 w-full max-w-full">
            <VideoTransportBar videoRef={expandedVideoRef} videoUrl={videoUrl} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
