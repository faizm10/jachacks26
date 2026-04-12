"use client";

import {
  JOHN_ABBOTT_3D_FLOORS,
  JOHN_ABBOTT_3D_MATS_DARK,
  JOHN_ABBOTT_LIBRARY_STACK_GAP as STACK_GAP,
  JOHN_ABBOTT_LIBRARY_SUBTITLE,
  type LibraryFloorKey,
  type LibraryRoom3D,
  type LibraryRoomType,
} from "@/lib/spatial/john-abbott-library-3d-data";
import {
  createJohnAbbottActivityHexes,
  disposeHexColumnMeshes,
  getZoneLabelAnchors,
  HEATMAP_SCALE,
  pulseHexColumns,
  updateCanvasWorldLabels,
  type CanvasWorldLabel,
} from "@/lib/spatial/john-abbott-hex-heatmap";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SCALE = HEATMAP_SCALE;
const HOVER_EMISSIVE = 0x4c6fa8;

const LABEL_Y_LIFT = 10;

function roomAnchorWorld(
  r: { x: number; z: number; w: number; d: number; h: number },
  yBoost: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    r.x * SCALE + (r.w * SCALE) / 2,
    r.h * 5 + yBoost + LABEL_Y_LIFT,
    r.z * SCALE + (r.d * SCALE) / 2,
  );
}

function getStackedAreaMarkers(stackGap: number) {
  const f1 = JOHN_ABBOTT_3D_FLOORS.f1.rooms;
  const bs = JOHN_ABBOTT_3D_FLOORS.bs.rooms;
  const pick = (rooms: readonly LibraryRoom3D[], id: string) => {
    const r = rooms.find((x) => x.id === id);
    if (!r) throw new Error(`Missing room label anchor: ${id}`);
    return r;
  };

  return [
    {
      id: "f1-reading",
      floor: "1st floor",
      title: "Main reading hall",
      accent: "#7dd3fc",
      world: roomAnchorWorld(pick(f1, "101B"), stackGap),
    },
    {
      id: "f1-east",
      floor: "1st floor",
      title: "East commons",
      accent: "#a5b4fc",
      world: roomAnchorWorld(pick(f1, "119"), stackGap),
    },
    {
      id: "f1-desk",
      floor: "1st floor",
      title: "Help & service",
      accent: "#fcd34d",
      world: roomAnchorWorld(pick(f1, "104"), stackGap),
    },
    {
      id: "bs-foyer",
      floor: "Basement",
      title: "Foyer · You are here",
      accent: "#86efac",
      world: roomAnchorWorld(pick(bs, "004"), 0),
    },
    {
      id: "bs-open",
      floor: "Basement",
      title: "Open study core",
      accent: "#67e8f9",
      world: roomAnchorWorld(pick(bs, "001"), 0),
    },
    {
      id: "bs-east",
      floor: "Basement",
      title: "East wing · lab & study",
      accent: "#93c5fd",
      world: roomAnchorWorld(pick(bs, "024"), 0),
    },
  ] as const;
}

type ViewMode = LibraryFloorKey | "stacked";

const FLOOR_SLAB = {
  width: 1400,
  depth: 900,
  cx: 380,
  cyGround: -0.02,
  cyHeat: 0.06,
  cz: 200,
} as const;

// ---------------------------------------------------------------------------
// ThreeCtx
// ---------------------------------------------------------------------------

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
  heatOverlay: THREE.Mesh | null;
  hexColumns: THREE.Mesh[];
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

function disposeHexColumns(ctx: ThreeCtx) {
  disposeHexColumnMeshes(ctx.scene, ctx.hexColumns);
}

const FLOOR_LABEL: Record<LibraryFloorKey, string> = {
  f1: "1st floor",
  bs: "Basement",
};

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
    const id = disambiguateIds ? `${floorTag} \u00b7 ${r.id}` : r.id;
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

function createHexColumns(ctx: ThreeCtx, bsYOffset: number, f1YOffset: number | null) {
  createJohnAbbottActivityHexes(ctx.scene, ctx.hexColumns, bsYOffset, f1YOffset);
}

// ---------------------------------------------------------------------------
// Build scene
// ---------------------------------------------------------------------------

function buildScene(ctx: ThreeCtx, mode: ViewMode) {
  clearRooms(ctx);
  disposeHexColumns(ctx);

  if (mode === "stacked") {
    appendFloorRooms(ctx, "bs", 0, true);
    appendFloorRooms(ctx, "f1", STACK_GAP, true);
    createHexColumns(ctx, 0, STACK_GAP);
    setStackedOrbitTarget(ctx);
  } else if (mode === "bs") {
    appendFloorRooms(ctx, mode, 0, false);
    createHexColumns(ctx, 0, null);
    const floor = JOHN_ABBOTT_3D_FLOORS[mode];
    ctx.target.set(floor.target.x, floor.target.y, floor.target.z);
  } else {
    appendFloorRooms(ctx, mode, 0, false);
    const f1Offset = mode === "f1" ? 0 : null;
    createHexColumns(ctx, 0, f1Offset);
    const floor = JOHN_ABBOTT_3D_FLOORS[mode];
    ctx.target.set(floor.target.x, floor.target.y, floor.target.z);
  }
  updateCamera(ctx);
  syncIdleAnchors(ctx);
}

const ZOOM_RADIUS_MIN = 120;
const ZOOM_RADIUS_MAX = 1750;

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JohnAbbottLibraryFloorThree({
  className,
  cornerActions,
  canvasChildren,
  motionHeatOverlayUrl = null,
  layoutVariant = "default",
  fillColumn = false,
  highlightRoomId,
}: {
  className?: string;
  cornerActions?: ReactNode;
  canvasChildren?: ReactNode;
  motionHeatOverlayUrl?: string | null;
  layoutVariant?: "default" | "stackedEmbed";
  fillColumn?: boolean;
  highlightRoomId?: string | null;
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
      hexColumns: [],
      idleT: 0,
      idleBaseTarget: new THREE.Vector3(380, 0, 180),
      idleBaseTheta: 0.6,
      lastFrameMs: performance.now(),
    };

    syncIdleAnchors(ctx);

    // Area labels (existing room labels)
    const screenLabelEntries: CanvasWorldLabel[] = [];
    let screenLabelLayer: HTMLDivElement | null = null;

    // Zone labels layer (hex heatmap zones)
    const zoneLabelEntries: CanvasWorldLabel[] = [];
    let zoneLabelLayer: HTMLDivElement | null = null;

    if (stackedEmbed) {
      // Existing area labels
      screenLabelLayer = document.createElement("div");
      screenLabelLayer.className =
        "pointer-events-none absolute inset-0 z-[28] overflow-visible";
      const markers = getStackedAreaMarkers(STACK_GAP);
      for (const m of markers) {
        const el = document.createElement("div");
        el.dataset.areaLabel = m.id;
        el.className =
          "absolute left-0 top-0 flex min-w-0 max-w-[10rem] flex-col gap-0.5 rounded-lg border border-white/[0.14] bg-black/50 px-2.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md";
        el.style.borderLeftStyle = "solid";
        el.style.borderLeftWidth = "3px";
        el.style.borderLeftColor = m.accent;
        el.style.willChange = "transform, opacity";
        const floorEl = document.createElement("span");
        floorEl.className =
          "text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45";
        floorEl.textContent = m.floor;
        const titleEl = document.createElement("span");
        titleEl.className =
          "text-[11px] font-semibold leading-snug tracking-tight text-white";
        titleEl.textContent = m.title;
        el.appendChild(floorEl);
        el.appendChild(titleEl);
        screenLabelLayer.appendChild(el);
        screenLabelEntries.push({ el, world: m.world });
      }
      host.appendChild(screenLabelLayer);

      // Zone labels for hex heatmap
      zoneLabelLayer = document.createElement("div");
      zoneLabelLayer.className =
        "pointer-events-none absolute inset-0 z-[29] overflow-visible";
      const zoneAnchors = getZoneLabelAnchors(0, STACK_GAP);
      for (const z of zoneAnchors) {
        const el = document.createElement("div");
        el.dataset.zoneLabel = z.id;
        el.className =
          "absolute left-0 top-0 flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/60 px-2.5 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-lg";
        el.style.willChange = "transform, opacity";
        const dot = document.createElement("span");
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.borderRadius = "50%";
        dot.style.backgroundColor = z.accent;
        dot.style.boxShadow = `0 0 8px ${z.accent}`;
        const txt = document.createElement("span");
        txt.className = "text-[10px] font-semibold tracking-wide text-white/80";
        txt.textContent = z.label;
        el.appendChild(dot);
        el.appendChild(txt);
        zoneLabelLayer.appendChild(el);
        zoneLabelEntries.push({ el, world: z.world });
      }
      host.appendChild(zoneLabelLayer);
    }

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
      if (ctx.hexColumns.length > 0) {
        pulseHexColumns(ctx.hexColumns, ctx.idleT);
      }
      renderer.render(scene, camera);
      if (screenLabelEntries.length) {
        updateCanvasWorldLabels(camera, canvas, screenLabelEntries);
      }
      if (zoneLabelEntries.length) {
        updateCanvasWorldLabels(camera, canvas, zoneLabelEntries);
      }
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
        } else {
          setSelected(null);
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
      screenLabelLayer?.remove();
      zoneLabelLayer?.remove();
      disposeHeatOverlay(ctx);
      disposeHexColumns(ctx);
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

  // Highlight room driven by external carousel
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    for (const m of ctx.meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const ud = m.userData as { id: string; baseEmissive: number; baseEmissiveIntensity: number };
      if (highlightRoomId && ud.id === highlightRoomId) {
        mat.emissive.setHex(0xfde68a);
        mat.emissiveIntensity = 0.8;
      } else {
        mat.emissive.setHex(ud.baseEmissive);
        mat.emissiveIntensity = ud.baseEmissiveIntensity;
      }
    }
  }, [highlightRoomId]);

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
          mesh.raycast = () => {};

          ctx.scene.add(mesh);
          ctx.heatOverlay = mesh;
        },
        undefined,
        () => {},
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
              ? "Drag to orbit when not placing \u00b7 Scroll to zoom \u00b7 click plan corners"
              : effectiveViewMode === "stacked"
                ? motionHeatOverlayUrl
                  ? "Stacked 3D \u00b7 basement + 1st above \u00b7 heat overlay \u00b7 orbit / zoom / pick a room"
                  : "Stacked 3D \u00b7 basement + 1st floor above \u00b7 orbit / zoom / pick a room"
                : motionHeatOverlayUrl
                  ? "Drag to orbit \u00b7 Scroll to zoom \u00b7 motion heat overlay \u00b7 Click a room"
                  : "Drag to orbit \u00b7 Scroll to zoom \u00b7 Click a room"}
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

        {!stackedEmbed && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-40">
            <div className="pointer-events-auto rounded-xl border border-white/[0.08] bg-black/60 px-3 py-2.5 backdrop-blur-sm">
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
          </div>
        )}
      </div>
    </div>
  );
}
