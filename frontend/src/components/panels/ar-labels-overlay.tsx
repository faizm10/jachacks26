"use client";

import type {
  DetectedObject,
  ObjectDetection as CocoObjectDetector,
} from "@tensorflow-models/coco-ssd";
import { getActivityLabelTheme, isLockedInActivity } from "@/lib/ar-label-activity-colors";
import type { DetectedPerson, FrameAnalysis } from "@/lib/types/room";
import { ArLabelColorLegend } from "@/components/panels/ar-label-color-legend";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SectionHeader } from "@/components/panels/section-header";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ── Tracking types ── */

interface TrackedPerson {
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  missedFrames: number;
  age: number;
  activity: string;
  /** Server / live-analysis person slot when matched (e.g. p0, p1). */
  personId: string | null;
  /** Confidence for displayed activity when from Gemini live analysis. */
  activityConfidence?: number;
}

/* ── Stabilization ── */

const SMOOTHING = 0.5;
const MAX_MISSED = 15;
const MIN_AGE = 3;
const IOU_THRESHOLD = 0.1;
const LABEL_MATCH_DIST = 0.35;

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
        personId: t.personId,
        activityConfidence: t.activityConfidence,
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
      personId: null,
      activityConfidence: undefined,
    });
  }
  return out;
}

/** One-to-one: each track gets at most one person, each person at most one track (nearest pairs first). */
function assignLabelsGreedy(tracks: TrackedPerson[], persons: DetectedPerson[]): void {
  if (persons.length === 0) return;

  type Pair = { ti: number; d: number; person: DetectedPerson };
  const pairs: Pair[] = [];

  for (let ti = 0; ti < tracks.length; ti++) {
    const t = tracks[ti];
    if (t.age < MIN_AGE) continue;
    const tcx = t.bbox.x + t.bbox.w / 2;
    const tcy = t.bbox.y + t.bbox.h / 2;
    for (const person of persons) {
      const pcx = person.bbox.x + person.bbox.w / 2;
      const pcy = person.bbox.y + person.bbox.h / 2;
      const d = Math.hypot(tcx - pcx, tcy - pcy);
      pairs.push({ ti, d, person });
    }
  }

  pairs.sort((a, b) => a.d - b.d);
  const usedTracks = new Set<number>();
  const usedPersonIds = new Set<string>();

  for (const { ti, d, person } of pairs) {
    if (d >= LABEL_MATCH_DIST) break;
    if (usedTracks.has(ti) || usedPersonIds.has(person.id)) continue;
    usedTracks.add(ti);
    usedPersonIds.add(person.id);
    const t = tracks[ti];
    t.personId = person.id;
    t.activity = person.activity;
    t.activityConfidence = person.confidence;
  }

  for (let ti = 0; ti < tracks.length; ti++) {
    const t = tracks[ti];
    if (t.age < MIN_AGE) continue;
    if (usedTracks.has(ti)) continue;
    t.personId = null;
    t.activity = "detected";
    t.activityConfidence = undefined;
  }
}

function applyCachedGeminiNearest(tracks: TrackedPerson[], gPersons: DetectedPerson[]): void {
  if (gPersons.length === 0) return;
  for (const track of tracks) {
    if (track.age < MIN_AGE) continue;
    const tx = track.bbox.x + track.bbox.w / 2;
    const ty = track.bbox.y + track.bbox.h / 2;
    let bestDist = Infinity;
    let bestAct = "detected";
    for (const gp of gPersons) {
      const gx = gp.bbox.x + gp.bbox.w / 2;
      const gy = gp.bbox.y + gp.bbox.h / 2;
      const d = Math.hypot(tx - gx, ty - gy);
      if (d < bestDist) {
        bestDist = d;
        bestAct = gp.activity;
      }
    }
    if (bestDist < LABEL_MATCH_DIST) {
      track.activity = bestAct;
      track.personId = null;
      track.activityConfidence = undefined;
    }
  }
}

/* ── Model loader ── */

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

/* ── Canvas drawing ── */

const EMERALD = "rgb(52, 211, 153)";
const EMERALD_SEMI = "rgba(52, 211, 153, 0.7)";
const AMBER = "rgb(251, 191, 36)";
const AMBER_SEMI = "rgba(251, 191, 36, 0.6)";
const RED = "rgb(248, 113, 113)";
const RED_SEMI = "rgba(248, 113, 113, 0.6)";
const LABEL_BG = "rgba(0, 0, 0, 0.8)";
const CORNER_LEN = 10;

type GeminiDrawStatus = "idle" | "sending" | "done" | "failed";

let _frameCount = 0;

function drawTracks(
  ctx: CanvasRenderingContext2D,
  tracks: TrackedPerson[],
  cw: number,
  ch: number,
  status: GeminiDrawStatus,
  highlightPersonId: string | null,
) {
  ctx.clearRect(0, 0, cw, ch);
  _frameCount++;

  const visible = tracks.filter((t) => t.age >= MIN_AGE);

  for (let i = 0; i < visible.length; i++) {
    const t = visible[i];
    const x = t.bbox.x * cw;
    const y = t.bbox.y * ch;
    const w = t.bbox.w * cw;
    const h = t.bbox.h * ch;
    const alpha = t.missedFrames === 0 ? 1 : Math.max(0.3, 1 - t.missedFrames * 0.08);
    const hasLabel = t.activity !== "detected";
    const isSending = !hasLabel && status === "sending";
    const isFailed = !hasLabel && status === "failed";
    const activityTheme = hasLabel ? getActivityLabelTheme(t.activity) : null;
    const isHighlight =
      Boolean(highlightPersonId && t.personId && t.personId === highlightPersonId);

    // Color by state (red/amber while waiting for Gemini; else activity-based)
    const boxColor = isFailed ? RED_SEMI : isSending ? AMBER_SEMI : activityTheme?.boxSemi ?? EMERALD_SEMI;
    const accentColor = isFailed ? RED : isSending ? AMBER : activityTheme?.accent ?? EMERALD;
    const textColor = isFailed
      ? "rgb(252, 165, 165)"
      : isSending
        ? "rgb(253, 224, 71)"
        : activityTheme?.text ?? "rgb(110, 231, 183)";

    ctx.globalAlpha = alpha;

    // Box (extra ring when insight row highlights this person)
    if (isHighlight) {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.shadowColor = "rgba(255,255,255,0.6)";
      ctx.shadowBlur = 14;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = isHighlight ? 3 : 2;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = isHighlight ? 14 : 8;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;

    // Corner accents
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y + CORNER_LEN); ctx.lineTo(x, y); ctx.lineTo(x + CORNER_LEN, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + CORNER_LEN); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h - CORNER_LEN); ctx.lineTo(x, y + h); ctx.lineTo(x + CORNER_LEN, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - CORNER_LEN, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - CORNER_LEN); ctx.stroke();

    // Label text
    let labelText: string;
    if (hasLabel) {
      const actConf = t.activityConfidence ?? t.confidence;
      labelText = `${t.activity}  ${Math.round(actConf * 100)}%`;
    } else if (isSending) {
      const dots = ".".repeat((Math.floor(_frameCount / 20) % 3) + 1);
      labelText = `analyzing${dots}`;
    } else if (isFailed) {
      labelText = "analysis failed";
    } else {
      labelText = "person";
    }

    ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
    const metrics = ctx.measureText(labelText);
    const lw = metrics.width + (isSending ? 28 : 16);
    const lh = 22;
    const lx = x + w / 2 - lw / 2;
    const ly = y - lh - 6;

    // Pill bg
    ctx.fillStyle = LABEL_BG;
    ctx.beginPath();
    const r = lh / 2;
    ctx.roundRect(lx, ly, lw, lh, r);
    ctx.fill();
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, r);
    ctx.stroke();

    // Indicator dot/spinner
    if (isSending) {
      const cx = lx + 10, cy = ly + lh / 2;
      const angle = (_frameCount * 0.08) % (Math.PI * 2);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, angle, angle + Math.PI * 1.4);
      ctx.stroke();
    } else if (isFailed) {
      // X mark
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      const cx = lx + 10, cy = ly + lh / 2;
      ctx.beginPath(); ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3); ctx.stroke();
    } else {
      ctx.fillStyle = activityTheme?.accent ?? EMERALD;
      ctx.beginPath();
      ctx.arc(lx + 10, ly + lh / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label text
    ctx.fillStyle = textColor;
    ctx.fillText(labelText, lx + (isSending ? 20 : 18), ly + lh / 2 + 4);

    // Person badge
    const badgeR = 9, bx = x - 4, by = y - 4;
    ctx.fillStyle = isFailed ? RED : isSending ? AMBER : activityTheme?.accent ?? EMERALD;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const badgeLabel = t.personId
      ? t.personId.length <= 4
        ? t.personId.toUpperCase()
        : t.personId.slice(0, 3).toUpperCase()
      : String(i + 1);
    ctx.fillText(badgeLabel, bx, by);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    ctx.globalAlpha = 1;
  }

  // Status bar at bottom
  if (status === "sending" && visible.length > 0) {
    // Indeterminate shimmer — no fake progress percentage
    const shimmerW = cw * 0.25;
    const shimmerX = ((_frameCount * 2) % (cw + shimmerW)) - shimmerW;
    ctx.globalAlpha = 0.5;
    const grad = ctx.createLinearGradient(shimmerX, 0, shimmerX + shimmerW, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, AMBER);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, ch - 3, cw, 3);
    ctx.globalAlpha = 1;
  }
}

/* ── Main component ── */

export interface ARLabelsOverlayProps {
  videoUrl: string | null;
  persons: DetectedPerson[];
  analyzing?: boolean;
  /** Scene line from live `/api/analyze` — preferred when persons are present. */
  liveSceneSummary?: string | null;
  /** Highlights the bbox whose `personId` matches (from Live insights click). */
  highlightedPersonId?: string | null;
  /** When true, renders without outer GlassPanel/header/legend (embedded in camera tile) */
  inline?: boolean;
  /** Called when the scene description updates (inline mode) so the parent can render it outside the overlay. */
  onSceneDescription?: (desc: string, status: "idle" | "sending" | "done" | "failed") => void;
  /** Controlled expand — parent sets true to open the expanded modal. */
  expanded?: boolean;
  /** Called when the expanded modal is closed. */
  onExpandedChange?: (v: boolean) => void;
  /** Increment to force re-analysis (e.g. after a failure). */
  retryKey?: number;
}

export function ARLabelsOverlay({
  videoUrl,
  persons,
  liveSceneSummary,
  highlightedPersonId,
  inline,
  onSceneDescription,
  expanded: controlledExpanded,
  onExpandedChange,
  retryKey,
}: ARLabelsOverlayProps) {
  const latestPersonsRef = useRef<DetectedPerson[]>(persons);
  latestPersonsRef.current = persons;
  const highlightIdRef = useRef<string | null>(highlightedPersonId ?? null);
  highlightIdRef.current = highlightedPersonId ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tracksRef = useRef<TrackedPerson[]>([]);
  const modelRef = useRef<CocoObjectDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);
  const expandedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedRafRef = useRef<number | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = useCallback((v: boolean) => {
    setInternalExpanded(v);
    onExpandedChange?.(v);
  }, [onExpandedChange]);
  const hasVideo = !!videoUrl;

  const [modelReady, setModelReady] = useState(false);
  const [personCount, setPersonCount] = useState(0);
  /** When any visible labeled track is "locked in", tint the header count chip pink. */
  const [lockedInChip, setLockedInChip] = useState(false);
  const [geminiStatusState, setGeminiStatusState] = useState<GeminiDrawStatus>("idle");
  const [sceneDescription, setSceneDescriptionInternal] = useState("");
  const setSceneDescription = useCallback((desc: string) => {
    setSceneDescriptionInternal(desc);
    onSceneDescription?.(desc, geminiStatusState);
  }, [onSceneDescription, geminiStatusState]);

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
    let lastVideoTime = -1;
    let maxTimeReached = 0;

    const loop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;

      if (!video || !canvas || !model || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Size canvas to match video display size
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const currentTime = video.currentTime;

      // Detect when the video loops: time jumps backward significantly — reset tracking
      if (currentTime < maxTimeReached - 1 && maxTimeReached > 1) {
        maxTimeReached = 0;
        tracksRef.current = [];
      }
      maxTimeReached = Math.max(maxTimeReached, currentTime);

      // Skip if video time hasn't changed (paused)
      if (Math.abs(currentTime - lastVideoTime) < 0.01) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          drawTracks(
            ctx,
            tracksRef.current,
            canvas.width,
            canvas.height,
            geminiStatus.current,
            highlightIdRef.current,
          );
        }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastVideoTime = currentTime;

      try {
        const preds = await model.detect(video);
        const raw: RawDet[] = preds
          .filter((p: DetectedObject) => p.class === "person" && p.score > 0.3)
          .map((p: DetectedObject) => ({
            bbox: {
              x: p.bbox[0] / video.videoWidth,
              y: p.bbox[1] / video.videoHeight,
              w: p.bbox[2] / video.videoWidth,
              h: p.bbox[3] / video.videoHeight,
            },
            confidence: p.score,
          }));

        tracksRef.current = updateTracks(tracksRef.current, raw);

        const livePersons = latestPersonsRef.current;
        if (livePersons.length > 0) {
          assignLabelsGreedy(tracksRef.current, livePersons);
        } else {
          applyCachedGeminiNearest(tracksRef.current, cachedGeminiPersons.current);
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          drawTracks(
            ctx,
            tracksRef.current,
            canvas.width,
            canvas.height,
            geminiStatus.current,
            highlightIdRef.current,
          );
        }

        // Update React state for the header count — throttled to avoid re-renders
        const now = Date.now();
        if (now - lastCountUpdate > 500) {
          const visible = tracksRef.current.filter((t) => t.age >= MIN_AGE);
          setPersonCount(visible.length);
          setLockedInChip(
            visible.some((t) => t.activity !== "detected" && isLockedInActivity(t.activity)),
          );
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

  // Notify parent when status changes
  useEffect(() => {
    onSceneDescription?.(sceneDescription, geminiStatusState);
  }, [geminiStatusState, sceneDescription, onSceneDescription]);

  // Gemini activity labels — run ONCE per video, cache across video switches
  // Persistent cache: url → { persons, sceneDescription }
  const analysisCacheRef = useRef<Map<string, { persons: DetectedPerson[]; scene: string }>>(new Map());
  const geminiCanvas = useRef<HTMLCanvasElement | null>(null);
  const inFlight = useRef(false);
  const geminiStatus = useRef<GeminiDrawStatus>("idle");
  const setGeminiStatus = useCallback((s: GeminiDrawStatus) => {
    geminiStatus.current = s;
    setGeminiStatusState(s);
  }, []);
  const cachedGeminiPersons = useRef<DetectedPerson[]>([]);

  const analyzeOnce = useCallback(async () => {
    if (!videoUrl || inFlight.current) return;
    if (latestPersonsRef.current.length > 0) {
      setGeminiStatus("done");
      return;
    }

    // Check persistent cache first
    const cached = analysisCacheRef.current.get(videoUrl);
    if (cached) {
      cachedGeminiPersons.current = cached.persons;
      setGeminiStatus("done");
      setSceneDescription(cached.scene);
      console.log("[AR] Loaded from cache —", cached.persons.length, "persons.");
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    if (!geminiCanvas.current) geminiCanvas.current = document.createElement("canvas");
    const c = geminiCanvas.current;

    const MAX_W = 640;
    const scale = Math.min(1, MAX_W / video.videoWidth);
    c.width = Math.round(video.videoWidth * scale);
    c.height = Math.round(video.videoHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, c.width, c.height);

    try {
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0) return;
    } catch {
      return;
    }

    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.split(",")[1];
    if (!base64 || base64.length < 100) return;

    inFlight.current = true;
    setGeminiStatus("sending");
    console.log("[AR] Sending frame to Gemini...");

    try {
      const res = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, mime_type: "image/jpeg" }),
      });
      if (!res.ok) {
        console.warn("[AR] Gemini failed:", res.status);
        setGeminiStatus("failed");
        return;
      }
      const data = (await res.json()) as FrameAnalysis;
      console.log("[AR] Gemini done —", data.persons.length, "persons.");

      cachedGeminiPersons.current = data.persons;
      setGeminiStatus("done");
      setSceneDescription(data.sceneDescription);

      // Save to persistent cache
      analysisCacheRef.current.set(videoUrl, {
        persons: data.persons,
        scene: data.sceneDescription,
      });
    } catch (e) {
      console.error("[AR] Gemini error:", e);
      setGeminiStatus("failed");
    } finally {
      inFlight.current = false;
    }
  }, [videoUrl]);

  useEffect(() => {
    const scene = (liveSceneSummary ?? "").trim();
    if (persons.length > 0 && scene) {
      setSceneDescription(scene);
      setGeminiStatus("done");
    }
  }, [persons, liveSceneSummary]);

  // Trigger analysis when video changes
  useEffect(() => {
    if (!hasVideo || !videoUrl) { setSceneDescription(""); return; }

    // Restore from cache immediately if available
    const cached = analysisCacheRef.current.get(videoUrl);
    if (cached) {
      cachedGeminiPersons.current = cached.persons;
      setGeminiStatus("done");
      setSceneDescription(cached.scene);
      return;
    }

    // Not cached — run analysis with retries
    setGeminiStatus("idle");
    let attempt = 0;
    const delays = [1500, 6000, 15000];

    const tryNext = () => {
      if (geminiStatus.current === "done" || attempt >= delays.length) return;
      const delay = delays[attempt];
      attempt++;
      return window.setTimeout(() => {
        if (geminiStatus.current !== "done") void analyzeOnce().then(tryNext);
      }, delay);
    };

    const firstTimer = tryNext();
    return () => { if (firstTimer) clearTimeout(firstTimer); };
  }, [videoUrl, hasVideo, analyzeOnce]);

  // Reset tracks + canvas when switching videos (but NOT the analysis cache)
  useEffect(() => {
    tracksRef.current = [];
    inFlight.current = false;
    setPersonCount(0);
    setLockedInChip(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    // Reset Gemini state for this video (cache check happens in the effect above)
    if (!videoUrl || !analysisCacheRef.current.has(videoUrl)) {
      cachedGeminiPersons.current = [];
      setGeminiStatus("idle");
      setSceneDescription("");
    }
  }, [videoUrl]);

  // Re-trigger analysis when parent bumps retryKey
  useEffect(() => {
    if (!retryKey || !videoUrl) return;
    inFlight.current = false;
    analysisCacheRef.current.delete(videoUrl);
    cachedGeminiPersons.current = [];
    setGeminiStatus("idle");
    setSceneDescription("");
    const timer = window.setTimeout(() => void analyzeOnce(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // ── Inline mode: just the video + canvas, no wrapper ──
  if (inline) {
    return (
      <>
        <div className="relative h-full w-full overflow-hidden bg-black">
          {personCount > 0 && (
            <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="rounded-full border border-emerald-400/25 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-sm">
                {personCount} people
              </span>
            </div>
          )}
          {hasVideo ? (
            <>
              <video
                ref={videoRef}
                key={videoUrl}
                data-live-frame-capture=""
                data-analysis-url={videoUrl ?? ""}
                className="h-full w-full object-cover"
                src={videoUrl}
                autoPlay
                muted
                playsInline
                loop
                crossOrigin="anonymous"
              />
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ pointerEvents: "none" }}
              />
            </>
          ) : null}
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
        {/* Expanded fullscreen modal — shares existing tracks, no regeneration */}
        {expanded && hasVideo && typeof document !== "undefined" && createPortal(
          <ExpandedARModal
            videoUrl={videoUrl!}
            tracksRef={tracksRef}
            highlightIdRef={highlightIdRef}
            geminiStatus={geminiStatus.current}
            expandedVideoRef={expandedVideoRef}
            expandedCanvasRef={expandedCanvasRef}
            expandedRafRef={expandedRafRef}
            personCount={personCount}
            sceneDescription={sceneDescription}
            onClose={() => setExpanded(false)}
          />,
          document.body,
        )}
      </>
    );
  }

  // ── Full mode: with wrapper, header, legend ──
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
                  modelReady
                    ? lockedInChip
                      ? "bg-pink-400 animate-pulse"
                      : "bg-emerald-400 animate-pulse"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
            )}
            {personCount > 0 ? (
              <span
                className={
                  lockedInChip
                    ? "rounded-full border border-pink-400/30 bg-pink-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-pink-200/95"
                    : "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90"
                }
              >
                {personCount} people
              </span>
            ) : null}
          </div>
        }
      />

      {sceneDescription && (
        <p className="mt-1 text-[11px] text-white/40">{sceneDescription}</p>
      )}

      <ArLabelColorLegend />

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black/60">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              key={videoUrl}
              data-live-frame-capture=""
              data-analysis-url={videoUrl ?? ""}
              className="h-full w-full object-contain"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              controls
              loop
              crossOrigin="anonymous"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ pointerEvents: "none" }}
            />
            {/* Expand button */}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="absolute right-3 top-3 z-20 rounded-lg border border-white/15 bg-black/60 p-1.5 text-white/60 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white/90"
              title="Expand"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
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

      {/* Expanded fullscreen modal */}
      {expanded && hasVideo && typeof document !== "undefined" && createPortal(
        <ExpandedARModal
          videoUrl={videoUrl!}
          tracksRef={tracksRef}
          highlightIdRef={highlightIdRef}
          geminiStatus={geminiStatus.current}
          expandedVideoRef={expandedVideoRef}
          expandedCanvasRef={expandedCanvasRef}
          expandedRafRef={expandedRafRef}
          personCount={personCount}
          sceneDescription={sceneDescription}
          onClose={() => setExpanded(false)}
        />,
        document.body,
      )}
    </GlassPanel>
  );
}

/* ── Expanded modal ── */

function ExpandedARModal({
  videoUrl,
  tracksRef,
  highlightIdRef,
  geminiStatus,
  expandedVideoRef,
  expandedCanvasRef,
  expandedRafRef,
  personCount,
  sceneDescription,
  onClose,
}: {
  videoUrl: string;
  tracksRef: React.RefObject<TrackedPerson[]>;
  highlightIdRef: React.RefObject<string | null>;
  geminiStatus: GeminiDrawStatus;
  expandedVideoRef: React.RefObject<HTMLVideoElement | null>;
  expandedCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  expandedRafRef: React.RefObject<number | null>;
  personCount: number;
  sceneDescription: string;
  onClose: () => void;
}) {
  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Mirror the detection overlay onto the expanded canvas
  useEffect(() => {
    const loop = () => {
      const video = expandedVideoRef.current;
      const canvas = expandedCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        expandedRafRef.current = requestAnimationFrame(loop);
        return;
      }

      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawTracks(
          ctx,
          tracksRef.current,
          canvas.width,
          canvas.height,
          geminiStatus,
          highlightIdRef.current,
        );
      }

      expandedRafRef.current = requestAnimationFrame(loop);
    };

    expandedRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (expandedRafRef.current) cancelAnimationFrame(expandedRafRef.current);
    };
  }, [tracksRef, highlightIdRef, expandedVideoRef, expandedCanvasRef, expandedRafRef, geminiStatus]);

  return (
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Expanded AR labels view"
        className="relative z-10 flex max-h-[min(94vh,960px)] w-full max-w-[min(96vw,1400px)] flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgba(6,8,12,0.95)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring" as const, stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-white/90">AR Labels — Expanded</p>
            {personCount > 0 && (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                {personCount} people
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.1]"
          >
            Close
          </button>
        </div>

        {sceneDescription && (
          <p className="border-b border-white/[0.05] px-5 py-2 text-[11px] text-white/40">{sceneDescription}</p>
        )}

        {/* Video + overlay */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/50 p-3 sm:p-5">
          <div className="relative w-full">
            <video
              ref={expandedVideoRef}
              className="max-h-[min(78vh,800px)] w-full rounded-lg object-contain"
              src={videoUrl}
              autoPlay
              muted
              playsInline
              controls
              loop
              crossOrigin="anonymous"
            />
            <canvas
              ref={expandedCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
