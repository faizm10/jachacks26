"use client";

import {
  JOHN_ABBOTT_3D_FLOORS,
  JOHN_ABBOTT_3D_MATS_DARK,
  JOHN_ABBOTT_LIBRARY_SUBTITLE,
  type LibraryFloorKey,
  type LibraryRoomType,
} from "@/lib/spatial/john-abbott-library-3d-data";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SCALE = 0.9;
const HOVER_EMISSIVE = 0x4c6fa8;

/** Vertical world-units between basement ceiling (~28u) and 1st-floor base in stacked view. */
const STACK_GAP = 174;

type ViewMode = LibraryFloorKey | "stacked";

/** Ground slab — homography heat PNG is draped here (same transform as the dark floor). */
const FLOOR_SLAB = {
  width: 1400,
  depth: 900,
  cx: 380,
  cyGround: -0.02,
  cyHeat: 0.06,
  cz: 200,
} as const;

interface ThreeCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  target: THREE.Vector3;
  meshes: THREE.Mesh[];
  edgeMeshes: THREE.LineSegments[];
  spherical: { theta: number; phi: number; radius: number };
  animId: number;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  resizeObserver: ResizeObserver;
  onPointerMove: (e: PointerEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onWheel: (e: WheelEvent) => void;
  hovMesh: THREE.Mesh | null;
  drag: boolean;
  prev: { x: number; y: number };
  /** Video-derived motion heat (RGBA); not used for room raycast. */
  heatOverlay: THREE.Mesh | null;
  /** Seconds accumulated for idle orbit + bob (paused while `drag`). */
  idleT: number;
  idleBaseTarget: THREE.Vector3;
  idleBaseTheta: number;
  lastFrameMs: number;
}

function disposeMesh(m: THREE.Mesh) {
  m.geometry.dispose();
  const mat = m.material;
  if (Array.isArray(mat)) mat.forEach((x) => (x as THREE.Material).dispose());
  else (mat as THREE.Material).dispose();
}

function disposeLine(l: THREE.LineSegments) {
  l.geometry.dispose();
  (l.material as THREE.Material).dispose();
}

function disposeHeatOverlay(ctx: ThreeCtx) {
  const mesh = ctx.heatOverlay;
  if (!mesh) return;
  ctx.scene.remove(mesh);
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
  mesh.geometry.dispose();
  ctx.heatOverlay = null;
}

function clearRooms(ctx: ThreeCtx) {
  for (const m of ctx.meshes) {
    ctx.scene.remove(m);
    disposeMesh(m);
  }
  for (const e of ctx.edgeMeshes) {
    ctx.scene.remove(e);
    disposeLine(e);
  }
  ctx.meshes = [];
  ctx.edgeMeshes = [];
}

const FLOOR_LABEL: Record<LibraryFloorKey, string> = {
  f1: "1st floor",
  bs: "Basement",
};

/**
 * Append one floor’s rooms (and edges) to the scene.
 * @param yBoost — vertical shift (stacked: 1st floor sits above basement by STACK_GAP).
 * @param disambiguateIds — prefix room id with floor key (needed when EXIT ids repeat across floors).
 */
function appendFloorRooms(
  ctx: ThreeCtx,
  floorKey: LibraryFloorKey,
  yBoost: number,
  disambiguateIds: boolean,
) {
  const floor = JOHN_ABBOTT_3D_FLOORS[floorKey];
  const mats = JOHN_ABBOTT_3D_MATS_DARK;
  const floorTag = FLOOR_LABEL[floorKey];

  for (const r of floor.rooms) {
    const matDef = mats[r.type as LibraryRoomType];
    const geo = new THREE.BoxGeometry(r.w * SCALE, r.h * 10, r.d * SCALE);
    const material = new THREE.MeshStandardMaterial({
      color: matDef.color,
      transparent: true,
      opacity: matDef.opacity,
      roughness: 0.9,
      metalness: 0.04,
      emissive: new THREE.Color(matDef.emissive),
      emissiveIntensity: 0.12,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(
      r.x * SCALE + (r.w * SCALE) / 2,
      r.h * 5 + yBoost,
      r.z * SCALE + (r.d * SCALE) / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const id = disambiguateIds ? `${floorTag} · ${r.id}` : r.id;
    mesh.userData = {
      id,
      note: disambiguateIds ? `${floorTag}: ${r.note}` : r.note,
      baseEmissive: matDef.emissive,
      baseEmissiveIntensity: 0.12,
    };
    ctx.scene.add(mesh);
    ctx.meshes.push(mesh);

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color: matDef.edge,
      transparent: true,
      opacity: 0.55,
    });
    const line = new THREE.LineSegments(edges, lineMat);
    line.position.copy(mesh.position);
    ctx.scene.add(line);
    ctx.edgeMeshes.push(line);
  }
}

function setStackedOrbitTarget(ctx: ThreeCtx) {
  const f1 = JOHN_ABBOTT_3D_FLOORS.f1;
  const bs = JOHN_ABBOTT_3D_FLOORS.bs;
  const midY = STACK_GAP * 0.52;
  ctx.target.set((f1.target.x + bs.target.x) / 2, midY, (f1.target.z + bs.target.z) / 2);
}

function buildScene(ctx: ThreeCtx, mode: ViewMode) {
  clearRooms(ctx);

  if (mode === "stacked") {
    appendFloorRooms(ctx, "bs", 0, true);
    appendFloorRooms(ctx, "f1", STACK_GAP, true);
    setStackedOrbitTarget(ctx);
  } else {
    appendFloorRooms(ctx, mode, 0, false);
    const floor = JOHN_ABBOTT_3D_FLOORS[mode];
    ctx.target.set(floor.target.x, floor.target.y, floor.target.z);
  }
  updateCamera(ctx);
  syncIdleAnchors(ctx);
}

const ZOOM_RADIUS_MIN = 120;
const ZOOM_RADIUS_MAX = 1750;

/** Idle showcase: orbit rate (rad/s) and gentle target bob (world units). */
const IDLE_ROT_RAD_PER_SEC = 0.085;
const IDLE_BOB_FREQ = 0.72;
const IDLE_BOB_AMP = 5.5;

function syncIdleAnchors(ctx: ThreeCtx) {
  ctx.idleBaseTarget.copy(ctx.target);
  ctx.idleBaseTheta = ctx.spherical.theta;
  ctx.idleT = 0;
}

function updateCamera(ctx: ThreeCtx) {
  const { spherical, target, camera } = ctx;
  const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  const y = spherical.radius * Math.cos(spherical.phi);
  const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

function applyWheelZoom(ctx: ThreeCtx, deltaY: number) {
  ctx.spherical.radius = Math.max(
    ZOOM_RADIUS_MIN,
    Math.min(ZOOM_RADIUS_MAX, ctx.spherical.radius + deltaY * 0.45),
  );
  updateCamera(ctx);
}

function pickHover(ctx: ThreeCtx, clientX: number, clientY: number) {
  const rect = ctx.canvas.getBoundingClientRect();
  ctx.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ctx.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);
  const hits = ctx.raycaster.intersectObjects(ctx.meshes);
  if (ctx.hovMesh) {
    const m = ctx.hovMesh.material as THREE.MeshStandardMaterial;
    m.emissive.setHex(ctx.hovMesh.userData.baseEmissive as number);
    m.emissiveIntensity = ctx.hovMesh.userData.baseEmissiveIntensity as number;
    ctx.hovMesh = null;
  }
  if (hits.length > 0) {
    const mesh = hits[0].object as THREE.Mesh;
    ctx.hovMesh = mesh;
    const m = mesh.material as THREE.MeshStandardMaterial;
    m.emissive.setHex(HOVER_EMISSIVE);
    m.emissiveIntensity = 0.35;
  }
}

export function JohnAbbottLibraryFloorThree({
  className,
  cornerActions,
  canvasChildren,
  /** Homography corridor heat from `/api/analyze-floorplan` (data URL) — shown on the ground slab. */
  motionHeatOverlayUrl = null,
  /**
   * Dashboard embed: locked stacked basement + 1st floor, minimal chrome (no floor tabs / room footer).
   */
  layoutVariant = "default",
  /** Fill parent height (dashboard column); uses host rect height for WebGL size instead of 3:2 aspect. */
  fillColumn = false,
}: {
  className?: string;
  cornerActions?: ReactNode;
  /** Optional content rendered inside the canvas host at z-30 (e.g. calibration click overlay). */
  canvasChildren?: ReactNode;
  motionHeatOverlayUrl?: string | null;
  layoutVariant?: "default" | "stackedEmbed";
  fillColumn?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<ThreeCtx | null>(null);
  const stackedEmbed = layoutVariant === "stackedEmbed";
  const [viewMode, setViewMode] = useState<ViewMode>("f1");
  const [selected, setSelected] = useState<{ id: string; note: string } | null>(null);
  const effectiveViewMode: ViewMode = stackedEmbed ? "stacked" : viewMode;

  const setSize = useCallback((ctx: ThreeCtx, w: number, h: number) => {
    const H = Math.max(120, h);
    const W = Math.max(160, w);
    ctx.camera.aspect = W / H;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(W, H);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const scene = new THREE.Scene();
    const transparentBg = layoutVariant === "stackedEmbed";
    /** Further back at first paint (stacked needs more vertical framing). */
    const defaultOrbitRadius = transparentBg ? 1280 : 1000;
    scene.background = transparentBg ? null : new THREE.Color(0x0c0f14);

    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 5000);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: transparentBg,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const amb = new THREE.AmbientLight(0xc8d4e8, 0.35);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(300, 520, -180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 2000;
    sun.shadow.camera.left = -700;
    sun.shadow.camera.right = 700;
    sun.shadow.camera.top = 700;
    sun.shadow.camera.bottom = -700;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7eb8ff, 0.22);
    fill.position.set(-220, 280, 320);
    scene.add(fill);

    const ctx: ThreeCtx = {
      scene,
      camera,
      renderer,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      target: new THREE.Vector3(380, 0, 180),
      meshes: [],
      edgeMeshes: [],
      spherical: { theta: 0.6, phi: 1.0, radius: defaultOrbitRadius },
      animId: 0,
      host,
      canvas,
      resizeObserver: new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (!cr?.width) return;
        const w = cr.width;
        const h =
          fillColumn && cr.height >= 80 ? Math.floor(cr.height) : Math.round((w * 2) / 3);
        setSize(ctx, w, h);
      }),
      onPointerMove: () => {},
      onPointerDown: () => {},
      onPointerUp: () => {},
      onWheel: () => {},
      hovMesh: null,
      drag: false,
      prev: { x: 0, y: 0 },
      heatOverlay: null,
      idleT: 0,
      idleBaseTarget: new THREE.Vector3(380, 0, 180),
      idleBaseTheta: 0.6,
      lastFrameMs: performance.now(),
    };

    syncIdleAnchors(ctx);

    ctx.resizeObserver.observe(host);

    const enableIdleMotion = stackedEmbed;

    const loop = () => {
      ctx.animId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.055, Math.max(0, (now - ctx.lastFrameMs) / 1000));
      ctx.lastFrameMs = now;
      if (!ctx.drag && enableIdleMotion) {
        ctx.idleT += dt;
        ctx.spherical.theta = ctx.idleBaseTheta + ctx.idleT * IDLE_ROT_RAD_PER_SEC;
        ctx.target.x = ctx.idleBaseTarget.x;
        ctx.target.y = ctx.idleBaseTarget.y + Math.sin(ctx.idleT * IDLE_BOB_FREQ) * IDLE_BOB_AMP;
        ctx.target.z = ctx.idleBaseTarget.z;
        updateCamera(ctx);
      }
      renderer.render(scene, camera);
    };
    loop();

    const onPointerDown = (e: PointerEvent) => {
      ctx.drag = false;
      ctx.prev = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - ctx.prev.x;
      const dy = e.clientY - ctx.prev.y;
      if (e.buttons === 1) {
        ctx.drag = true;
        ctx.spherical.theta -= dx * 0.008;
        ctx.spherical.phi = Math.max(0.2, Math.min(1.45, ctx.spherical.phi + dy * 0.008));
        updateCamera(ctx);
      }
      ctx.prev = { x: e.clientX, y: e.clientY };
      pickHover(ctx, e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDrag = ctx.drag;
      if (wasDrag) {
        ctx.idleBaseTheta = ctx.spherical.theta;
        ctx.idleBaseTarget.copy(ctx.target);
        ctx.idleT = 0;
      }
      ctx.drag = false;
      if (!wasDrag) {
        pickHover(ctx, e.clientX, e.clientY);
        ctx.raycaster.setFromCamera(ctx.mouse, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(ctx.meshes);
        if (hits.length > 0) {
          const mesh = hits[0].object as THREE.Mesh;
          const { id, note } = mesh.userData as { id: string; note: string };
          setSelected({ id, note });
        }
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyWheelZoom(ctx, e.deltaY);
    };

    ctx.onPointerDown = onPointerDown;
    ctx.onPointerMove = onPointerMove;
    ctx.onPointerUp = onPointerUp;
    ctx.onWheel = onWheel;

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    /** Host-level wheel: calibration overlay sits above the canvas and would otherwise eat scroll-zoom. */
    host.addEventListener("wheel", onWheel, { passive: false });

    const w0 = host.clientWidth || 640;
    const rect0 = host.getBoundingClientRect();
    const h0 =
      fillColumn && rect0.height >= 80
        ? Math.floor(rect0.height)
        : Math.round((w0 * 2) / 3);
    setSize(ctx, w0, h0);

    ctxRef.current = ctx;

    return () => {
      cancelAnimationFrame(ctx.animId);
      ctx.resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      disposeHeatOverlay(ctx);
      clearRooms(ctx);
      scene.remove(amb);
      scene.remove(sun);
      scene.remove(fill);
      renderer.dispose();
      ctxRef.current = null;
    };
  }, [setSize, layoutVariant, fillColumn, stackedEmbed]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      buildScene(ctx, effectiveViewMode);
    });
    return () => cancelAnimationFrame(id);
  }, [effectiveViewMode]);

  useEffect(() => {
    if (!motionHeatOverlayUrl) {
      const ctx = ctxRef.current;
      if (ctx) disposeHeatOverlay(ctx);
      return;
    }

    let cancelled = false;
    let raf = 0;

    const attach = () => {
      if (cancelled) return;
      const ctx = ctxRef.current;
      if (!ctx) {
        raf = requestAnimationFrame(attach);
        return;
      }

      disposeHeatOverlay(ctx);

      const loader = new THREE.TextureLoader();
      loader.load(
        motionHeatOverlayUrl,
        (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;

          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SLAB.width, FLOOR_SLAB.depth), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(FLOOR_SLAB.cx, FLOOR_SLAB.cyHeat, FLOOR_SLAB.cz);
          mesh.renderOrder = 2;
          mesh.frustumCulled = false;
          mesh.name = "motionHeatOverlay";
          mesh.raycast = () => {
            /* slab is for display only — room picking uses ctx.meshes */
          };

          ctx.scene.add(mesh);
          ctx.heatOverlay = mesh;
        },
        undefined,
        () => {
          /* decode / CORS issues — leave floor without heat */
        },
      );
    };

    raf = requestAnimationFrame(attach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      const ctx = ctxRef.current;
      if (ctx) disposeHeatOverlay(ctx);
    };
  }, [motionHeatOverlayUrl]);

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        stackedEmbed && fillColumn && "h-full min-h-0 flex-1",
        className,
      )}
    >
      {!stackedEmbed ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex gap-0.5 rounded-lg border border-white/[0.08] bg-black/40 p-0.5"
            role="tablist"
            aria-label="Library floor"
          >
            {(
              [
                ["f1", "1st floor"],
                ["bs", "Basement"],
                ["stacked", "Stacked"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={viewMode === key}
                onClick={() => {
                  setViewMode(key);
                  setSelected(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === key
                    ? "bg-white/[0.12] text-white shadow-sm"
                    : "text-white/45 hover:bg-white/[0.06] hover:text-white/75",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] tracking-wide text-white/35">
            {canvasChildren
              ? "Drag to orbit when not placing · Scroll to zoom · click plan corners"
              : effectiveViewMode === "stacked"
                ? motionHeatOverlayUrl
                  ? "Stacked 3D · basement + 1st above · heat overlay · orbit / zoom / pick a room"
                  : "Stacked 3D · basement + 1st floor above · orbit / zoom / pick a room"
                : motionHeatOverlayUrl
                  ? "Drag to orbit · Scroll to zoom · motion heat overlay · Click a room"
                  : "Drag to orbit · Scroll to zoom · Click a room"}
          </p>
        </div>
      ) : null}

      <div
        ref={hostRef}
        className={cn(
          "relative w-full overflow-hidden",
          stackedEmbed && fillColumn && "min-h-0 flex-1",
          stackedEmbed && !fillColumn && "aspect-[3/2]",
          !stackedEmbed && "aspect-[3/2] rounded-xl border border-white/[0.06] bg-[#0c0f14]",
          stackedEmbed && "rounded-none border-0 bg-transparent",
        )}
        aria-label={stackedEmbed ? "Stacked library floors, 3D" : "Library floor, 3D"}
      >
        {cornerActions ? (
          <div className="pointer-events-none absolute right-2 top-2 z-40 flex flex-col items-end gap-1">
            <div className="pointer-events-auto z-20">{cornerActions}</div>
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing",
            stackedEmbed && "bg-transparent",
          )}
        />
        {canvasChildren}
      </div>

      {!stackedEmbed ? (
        <div className="rounded-xl border border-white/[0.08] bg-black/35 px-3 py-2.5">
          {selected ? (
            <>
              <p className="text-sm font-medium text-white/90">{selected.id}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">{selected.note}</p>
              <p className="mt-2 text-[10px] text-white/35">{JOHN_ABBOTT_LIBRARY_SUBTITLE}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-white/75">Select a room</p>
              <p className="mt-0.5 text-[11px] text-white/40">{JOHN_ABBOTT_LIBRARY_SUBTITLE}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
