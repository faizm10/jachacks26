"use client";

import type { MappableRegion, CamOption } from "@/hooks/use-live-floor-bars";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ── Video picker modal ── */

type ModalStep = "pick" | "calibrating" | "generating";

function CameraPickerModal({
  region,
  cams,
  onSelect,
  onClose,
}: {
  region: MappableRegion;
  cams: CamOption[];
  onSelect: (videoName: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ModalStep>("pick");
  const [selectedCam, setSelectedCam] = useState<CamOption | null>(null);
  const timerRef = useRef<number>(undefined);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cleanup timers
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleSelect = useCallback((cam: CamOption) => {
    setSelectedCam(cam);
    setStep("calibrating");

    // Simulate calibration → generation
    timerRef.current = window.setTimeout(() => {
      setStep("generating");
      timerRef.current = window.setTimeout(() => {
        onSelect(cam.name);
        onClose();
      }, 1800);
    }, 1500);
  }, [onSelect, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0c0f14] shadow-2xl shadow-black/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold text-white/90">
              {step === "pick" ? "Select camera feed" : step === "calibrating" ? "Confirming orientation…" : "Generating activity map…"}
            </p>
            <p className="mt-0.5 text-[11px] text-white/35">
              {region.label} · {region.floor === "f1" ? "1st floor" : "Basement"}
            </p>
          </div>
          {step === "pick" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5">
          {step === "pick" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cams.map((cam) => (
                <button
                  key={cam.name}
                  type="button"
                  onClick={() => handleSelect(cam)}
                  className="group relative overflow-hidden rounded-xl border border-white/8 bg-black/40 text-left transition-all hover:border-white/20 hover:shadow-lg"
                >
                  {/* Video thumbnail */}
                  <div className="aspect-video w-full bg-black">
                    <video
                      src={cam.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-100"
                      onLoadedMetadata={(e) => {
                        // Seek to 1s for a meaningful thumbnail
                        (e.target as HTMLVideoElement).currentTime = 1;
                      }}
                    />
                  </div>
                  <div className="px-3 py-2">
                    <p className="truncate text-[11px] font-medium text-white/70 group-hover:text-white/90">
                      {cam.path}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {(step === "calibrating" || step === "generating") && selectedCam && (
            <div className="flex flex-col items-center py-8">
              {/* Spinner */}
              <div className="relative mb-6">
                <div className={cn(
                  "h-14 w-14 rounded-full border-2 border-t-transparent",
                  step === "calibrating" ? "border-amber-400/50 animate-spin" : "border-emerald-400/50 animate-spin",
                )} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {step === "calibrating" ? (
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-amber-400/70" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400/70" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  )}
                </div>
              </div>

              <p className={cn(
                "text-sm font-semibold",
                step === "calibrating" ? "text-amber-300" : "text-emerald-300",
              )}>
                {step === "calibrating" ? "Confirming spatial orientation" : "Mapping activity to floor plan"}
              </p>

              <p className="mt-2 max-w-xs text-center text-[12px] leading-relaxed text-white/40">
                {step === "calibrating"
                  ? "Aligning camera perspective with building geometry and verifying corner correspondence…"
                  : "Running person detection and placing activity bars on the 3D model…"}
              </p>

              <p className="mt-4 text-[11px] text-white/25">
                Feed: <span className="text-white/50">{selectedCam.path}</span>
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* ── Main panel ── */

export function CameraMappingPanel({
  regions,
  cams,
  camsLoading,
  onAssign,
  activeRegionId,
  onRegionClick,
}: {
  regions: MappableRegion[];
  cams: CamOption[];
  camsLoading: boolean;
  onAssign: (regionId: string, videoName: string | null) => void;
  activeRegionId: string | null;
  onRegionClick: (regionId: string | null) => void;
}) {
  const [pickerRegion, setPickerRegion] = useState<MappableRegion | null>(null);

  const dataDriven = regions.filter((r) => !r.hardcoded);
  const hardcoded = regions.filter((r) => r.hardcoded);

  return (
    <>
      <div className="rounded-xl border border-white/8 bg-[#0a0c10]">
        {/* Console header */}
        <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">
              Zone monitor
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] font-medium text-emerald-400/60">
              {regions.filter((r) => r.status === "done").length}/{regions.length} online
            </span>
          </div>
        </div>

        {/* Camera channels */}
        <div className="divide-y divide-white/4">
          {/* Data-driven channels */}
          {dataDriven.map((region, i) => {
            const isActive = activeRegionId === region.id;
            const channelNum = String(i + 1).padStart(2, "0");
            return (
              <motion.div
                key={region.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                onMouseEnter={() => onRegionClick(region.id)}
                onMouseLeave={() => onRegionClick(null)}
                className={cn(
                  "px-4 py-3 transition-all",
                  isActive && "bg-amber-400/4",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums",
                    region.status === "done"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : region.status === "analyzing"
                        ? "bg-amber-500/15 text-amber-400 animate-pulse"
                        : "bg-white/5 text-white/25",
                  )}>
                    {channelNum}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-white/85">{region.label}</p>
                      {region.status === "analyzing" && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-amber-400/70">
                          Scanning…
                        </span>
                      )}
                      {region.status === "done" && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70">
                          Online
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/25">
                      {region.floor === "f1" ? "F1" : "B1"} · {region.roomIds.join(", ")}
                    </p>
                  </div>
                </div>

                {/* Assign button or current feed */}
                <div className="mt-2 pl-10">
                  {region.status === "idle" && !region.assignedVideo ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPickerRegion(region); }}
                      disabled={camsLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 bg-transparent px-3 py-2 text-[11px] font-medium text-white/35 transition-colors hover:border-white/20 hover:bg-white/4 hover:text-white/55 disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 4v16m8-8H4" />
                      </svg>
                      Assign camera feed
                    </button>
                  ) : region.assignedVideo ? (
                    <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/3 px-3 py-1.5">
                      <span className="truncate text-[11px] text-white/50">{region.assignedVideo}</span>
                      {region.status === "done" && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPickerRegion(region); }}
                          className="ml-2 shrink-0 text-[10px] text-white/30 hover:text-white/60"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>

                {region.status === "error" && (
                  <div className="mt-1.5 pl-10">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAssign(region.id, region.assignedVideo); }}
                      className="text-[10px] font-medium text-red-400/80 hover:text-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Separator */}
          {hardcoded.length > 0 && dataDriven.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="h-px flex-1 bg-white/4" />
              <span className="text-[8px] font-bold uppercase tracking-[0.25em] text-white/15">
                Fixed sensors
              </span>
              <div className="h-px flex-1 bg-white/4" />
            </div>
          )}

          {/* Hardcoded channels */}
          {hardcoded.map((region, i) => {
            const isActive = activeRegionId === region.id;
            const channelNum = String(dataDriven.length + i + 1).padStart(2, "0");
            return (
              <motion.div
                key={region.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: (dataDriven.length + i) * 0.04 }}
                onMouseEnter={() => onRegionClick(region.id)}
                onMouseLeave={() => onRegionClick(null)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 transition-all",
                  isActive && "bg-amber-400/4",
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold tabular-nums bg-emerald-500/10 text-emerald-500/60">
                  {channelNum}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white/55">{region.label}</p>
                  <p className="text-[9px] text-white/20">
                    {region.floor === "f1" ? "F1" : "B1"} · {region.roomIds.join(", ")}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <span className="relative flex h-1 w-1">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-[9px] text-emerald-500/50">Live</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Video picker modal */}
      <AnimatePresence>
        {pickerRegion && (
          <CameraPickerModal
            region={pickerRegion}
            cams={cams}
            onSelect={(videoName) => onAssign(pickerRegion.id, videoName)}
            onClose={() => setPickerRegion(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
