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
  type LivePersonBar,
} from "@/lib/spatial/john-abbott-hex-heatmap";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SCALE = HEATMAP_SCALE;
/** Hover rim — readable on warm light shells */
const HOVER_EMISSIVE = 0x6a8eb5;

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
      title: "Foyer",
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
  ctx.target.set(
    (f1.target.x + bs.target.x) / 2,
    midY,
    (f1.target.z + bs.target.z) / 2,
  );
}

function createHexColumns(
  ctx: ThreeCtx,
  bsYOffset: number,
  f1YOffset: number | null,
  livePersons?: LivePersonBar[],
) {
  createJohnAbbottActivityHexes(
    ctx.scene,
    ctx.hexColumns,
    bsYOffset,
    f1YOffset,
    livePersons,
  );
}

// ---------------------------------------------------------------------------
// Build scene
// ---------------------------------------------------------------------------

function buildScene(
  ctx: ThreeCtx,
  mode: ViewMode,
  hexColumns = true,
  livePersons?: LivePersonBar[],
) {
  clearRooms(ctx);
  disposeHexColumns(ctx);

  if (mode === "stacked") {
    appendFloorRooms(ctx, "bs", 0, true);
    appendFloorRooms(ctx, "f1", STACK_GAP, true);
    if (hexColumns) createHexColumns(ctx, 0, STACK_GAP, livePersons);
    setStackedOrbitTarget(ctx);
  } else if (mode === "bs") {
    appendFloorRooms(ctx, mode, 0, false);
    if (hexColumns) createHexColumns(ctx, 0, null, livePersons);
    const floor = JOHN_ABBOTT_3D_FLOORS[mode];
    ctx.target.set(floor.target.x, floor.target.y, floor.target.z);
  } else {
    appendFloorRooms(ctx, mode, 0, false);
    if (hexColumns) {
      const f1Offset = mode === "f1" ? 0 : null;
      createHexColumns(ctx, 0, f1Offset, livePersons);
    }
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
  const x =
    target.x +
    spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  const y = spherical.radius * Math.cos(spherical.phi);
  const z =
    target.z +
    spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
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

export interface FocusRegion {
  /** Which floor: "f1" or "bs" */
  floor: LibraryFloorKey;
  /** Room IDs from the 3D data to highlight and zoom into */
  roomIds: string[];
  /** Human-readable zone name */
  label: string;
}

export function JohnAbbottLibraryFloorThree({
  className,
  cornerActions,
  canvasChildren,
  motionHeatOverlayUrl = null,
  layoutVariant = "default",
  fillColumn = false,
  highlightRoomId,
  showHexColumns = true,
  focusRegion,
  livePersons,
  onRoomClick,
  pulseRoomIds,
  glowRoomIds,
}: {
  className?: string;
  cornerActions?: ReactNode;
  canvasChildren?: ReactNode;
  motionHeatOverlayUrl?: string | null;
  layoutVariant?: "default" | "stackedEmbed";
  fillColumn?: boolean;
  highlightRoomId?: string | string[] | null;
  /** When false, skip the hex density columns (default true). */
  showHexColumns?: boolean;
  /** Zoom into and highlight a specific calibration region on the floor plan. */
  focusRegion?: FocusRegion | null;
  /** Data-driven bars from video analysis — placed at exact positions. */
  livePersons?: LivePersonBar[];
  /** Called when user clicks a room mesh. */
  onRoomClick?: (roomId: string | null) => void;
  /** Room IDs that should pulse yellow (e.g. during analysis). */
  pulseRoomIds?: string[] | null;
  /** Room IDs that should glow green (analysis complete). */
  glowRoomIds?: string[] | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<ThreeCtx | null>(null);
  const onRoomClickRef = useRef(onRoomClick);
  onRoomClickRef.current = onRoomClick;
  const pulseRoomIdsRef = useRef(pulseRoomIds);
  pulseRoomIdsRef.current = pulseRoomIds;
  const glowRoomIdsRef = useRef(glowRoomIds);
  glowRoomIdsRef.current = glowRoomIds;
  const highlightRoomIdRef = useRef(highlightRoomId);
  highlightRoomIdRef.current = highlightRoomId;
  const stackedEmbed = layoutVariant === "stackedEmbed";
  const [viewMode, setViewMode] = useState<ViewMode>("f1");
  const [selected, setSelected] = useState<{ id: string; note: string } | null>(
    null,
  );
  const effectiveViewMode: ViewMode = focusRegion
    ? focusRegion.floor
    : stackedEmbed
      ? "stacked"
      : viewMode;

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
    scene.background = transparentBg ? null : new THREE.Color(0xf4efe6);

    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 5000);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: transparentBg,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(
      Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2),
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const amb = new THREE.AmbientLight(0xfff4ea, 0.48);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 0.78);
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
    const fill = new THREE.DirectionalLight(0xffe4c8, 0.2);
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
          fillColumn && cr.height >= 80
            ? Math.floor(cr.height)
            : Math.round((w * 2) / 3);
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
          "absolute left-0 top-0 flex min-w-0 max-w-[10rem] flex-col gap-0.5 rounded-lg border border-border/90 bg-popover/95 px-2.5 py-1.5 shadow-md backdrop-blur-md";
        el.style.borderLeftStyle = "solid";
        el.style.borderLeftWidth = "3px";
        el.style.borderLeftColor = m.accent;
        el.style.willChange = "transform, opacity";
        const floorEl = document.createElement("span");
        floorEl.className =
          "text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";
        floorEl.textContent = m.floor;
        const titleEl = document.createElement("span");
        titleEl.className =
          "text-[11px] font-semibold leading-snug tracking-tight text-foreground";
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
          "absolute left-0 top-0 flex items-center gap-1.5 rounded-full border border-border/90 bg-popover/95 px-2.5 py-1 shadow-md backdrop-blur-lg";
        el.style.willChange = "transform, opacity";
        const dot = document.createElement("span");
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.borderRadius = "50%";
        dot.style.backgroundColor = z.accent;
        dot.style.boxShadow = `0 0 8px ${z.accent}`;
        const txt = document.createElement("span");
        txt.className = "text-[10px] font-semibold tracking-wide text-foreground";
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
        ctx.spherical.theta =
          ctx.idleBaseTheta + ctx.idleT * IDLE_ROT_RAD_PER_SEC;
        ctx.target.x = ctx.idleBaseTarget.x;
        ctx.target.y =
          ctx.idleBaseTarget.y +
          Math.sin(ctx.idleT * IDLE_BOB_FREQ) * IDLE_BOB_AMP;
        ctx.target.z = ctx.idleBaseTarget.z;
        updateCamera(ctx);
      }
      if (ctx.hexColumns.length > 0) {
        pulseHexColumns(ctx.hexColumns, ctx.idleT);
      }
      // Yellow pulse on rooms being analyzed
      const pIds = pulseRoomIdsRef.current;
      if (pIds && pIds.length > 0) {
        const pSet = new Set(pIds);
        const t = now * 0.003;
        const intensity = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t));
        for (const m of ctx.meshes) {
          const ud = m.userData as {
            id: string;
            baseEmissive: number;
            baseEmissiveIntensity: number;
          };
          if (pSet.has(ud.id)) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(0xfbbf24); // amber-400
            mat.emissiveIntensity = intensity;
          }
        }
      }
      // Highlight from carousel/user selection — takes highest priority
      const hRaw = highlightRoomIdRef.current;
      const hSet = !hRaw ? null : new Set(Array.isArray(hRaw) ? hRaw : [hRaw]);

      // Green glow on rooms where analysis is complete (skip highlighted + pulsing)
      const gIds = glowRoomIdsRef.current;
      if (gIds && gIds.length > 0) {
        const gSet = new Set(gIds);
        for (const m of ctx.meshes) {
          const ud = m.userData as {
            id: string;
            baseEmissive: number;
            baseEmissiveIntensity: number;
          };
          if (gSet.has(ud.id) && !(pIds && new Set(pIds).has(ud.id)) && !(hSet && hSet.has(ud.id))) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(0x34d399); // emerald-400
            mat.emissiveIntensity = 0.7;
          }
        }
      }
      // Carousel/user highlight — amber glow, always on top
      if (hSet && hSet.size > 0) {
        for (const m of ctx.meshes) {
          const ud = m.userData as { id: string };
          if (hSet.has(ud.id)) {
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(0xfde68a);
            mat.emissiveIntensity = 0.8;
          }
        }
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
        ctx.spherical.phi = Math.max(
          0.2,
          Math.min(1.45, ctx.spherical.phi + dy * 0.008),
        );
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
          onRoomClickRef.current?.(id);
        } else {
          setSelected(null);
          onRoomClickRef.current?.(null);
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

  const livePersonsRef = useRef(livePersons);
  livePersonsRef.current = livePersons;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      buildScene(
        ctx,
        effectiveViewMode,
        showHexColumns,
        livePersonsRef.current,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [effectiveViewMode, showHexColumns]);

  // Rebuild hex columns when live person data arrives
  useEffect(() => {
    if (!livePersons || livePersons.length === 0) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    disposeHexColumns(ctx);
    const isStacked = effectiveViewMode === "stacked";
    createHexColumns(
      ctx,
      0,
      isStacked ? STACK_GAP : effectiveViewMode === "f1" ? 0 : null,
      livePersons,
    );
  }, [livePersons, effectiveViewMode]);

  // Highlight room driven by external carousel
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const ids = !highlightRoomId
      ? null
      : Array.isArray(highlightRoomId)
        ? new Set(highlightRoomId)
        : new Set([highlightRoomId]);
    const pulsing = pulseRoomIdsRef.current
      ? new Set(pulseRoomIdsRef.current)
      : null;
    const glowing = glowRoomIdsRef.current
      ? new Set(glowRoomIdsRef.current)
      : null;
    for (const m of ctx.meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const ud = m.userData as {
        id: string;
        baseEmissive: number;
        baseEmissiveIntensity: number;
      };
      // Skip rooms handled by the render loop (pulse / glow)
      if (pulsing && pulsing.has(ud.id)) continue;
      if (glowing && glowing.has(ud.id)) continue;
      if (ids && ids.has(ud.id)) {
        mat.emissive.setHex(0xfde68a);
        mat.emissiveIntensity = 0.8;
      } else {
        mat.emissive.setHex(ud.baseEmissive);
        mat.emissiveIntensity = ud.baseEmissiveIntensity;
      }
    }
  }, [highlightRoomId]);

  // Focus region — zoom camera to specific rooms + glow them with light
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !focusRegion) return;

    // Wait one frame for buildScene to finish populating meshes
    const raf = requestAnimationFrame(() => {
      // Find the room IDs that match, computing a bounding box in scene-space
      const roomIdSet = new Set(
        focusRegion.roomIds.map((id) => id.toLowerCase()),
      );
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      const matched: THREE.Mesh[] = [];

      for (const m of ctx.meshes) {
        const ud = m.userData as { id: string };
        // Room IDs might be prefixed with floor label in stacked mode (e.g. "Basement · 024")
        const rawId = ud.id.includes("·") ? ud.id.split("·")[1].trim() : ud.id;
        if (roomIdSet.has(rawId.toLowerCase())) {
          matched.push(m);
          const geo = m.geometry as THREE.BoxGeometry;
          const params = geo.parameters;
          const halfW = params.width / 2;
          const halfD = params.depth / 2;
          minX = Math.min(minX, m.position.x - halfW);
          maxX = Math.max(maxX, m.position.x + halfW);
          minZ = Math.min(minZ, m.position.z - halfD);
          maxZ = Math.max(maxZ, m.position.z + halfD);
        }
      }

      if (matched.length === 0) return;

      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      const maxSpan = Math.max(spanX, spanZ);

      // Glow the matched rooms
      for (const m of matched) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0xfb923c);
        mat.emissiveIntensity = 0.65;
      }

      // Dim non-matched rooms to make the focus pop
      for (const m of ctx.meshes) {
        if (!matched.includes(m)) {
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.opacity = Math.min(mat.opacity, 0.3);
        }
      }

      // Glowing ground plane under the region
      const padX = spanX * 0.08;
      const padZ = spanZ * 0.08;
      const planeGeo = new THREE.PlaneGeometry(
        spanX + padX * 2,
        spanZ + padZ * 2,
      );
      const planeMat = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.rotation.x = -Math.PI / 2;
      planeMesh.position.set(cx, 0.1, cz);
      planeMesh.renderOrder = 3;
      planeMesh.name = "focusRegionGlow";
      ctx.scene.add(planeMesh);

      // Point light for the "brimming with light" effect
      const focusLight = new THREE.PointLight(0xfb923c, 2.0, maxSpan * 3, 1.2);
      focusLight.position.set(cx, 60, cz);
      focusLight.name = "focusRegionLight";
      ctx.scene.add(focusLight);

      // Secondary fill light from below for warmth
      const fillLight = new THREE.PointLight(0xfde68a, 0.8, maxSpan * 2, 1.5);
      fillLight.position.set(cx, 5, cz);
      fillLight.name = "focusRegionFill";
      ctx.scene.add(fillLight);

      // Zoom camera: radius proportional to region size, angled nicely
      ctx.target.set(cx, 12, cz);
      ctx.spherical.radius = Math.max(220, maxSpan * 1.6);
      ctx.spherical.theta = 0.55;
      ctx.spherical.phi = 0.9;
      updateCamera(ctx);
      syncIdleAnchors(ctx);
    });

    return () => {
      cancelAnimationFrame(raf);
      // Clean up added objects
      for (const name of [
        "focusRegionGlow",
        "focusRegionLight",
        "focusRegionFill",
      ]) {
        const obj = ctx.scene.getObjectByName(name);
        if (obj) {
          ctx.scene.remove(obj);
          if ((obj as THREE.Mesh).geometry)
            (obj as THREE.Mesh).geometry.dispose();
          if ((obj as THREE.Mesh).material)
            ((obj as THREE.Mesh).material as THREE.Material).dispose();
        }
      }
      // Restore room opacities
      for (const m of ctx.meshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        const ud = m.userData as {
          baseEmissive: number;
          baseEmissiveIntensity: number;
        };
        mat.emissive.setHex(ud.baseEmissive);
        mat.emissiveIntensity = ud.baseEmissiveIntensity;
        // Restore opacity from material type defaults
        mat.opacity = mat.opacity < 0.5 ? 0.9 : mat.opacity;
      }
    };
  }, [focusRegion]);

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
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(FLOOR_SLAB.width, FLOOR_SLAB.depth),
            mat,
          );
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
      )}>
      {!stackedEmbed ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex gap-0.5 rounded-lg border border-border/80 bg-popover/90 p-0.5"
            role="tablist"
            aria-label="Library floor">
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
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] tracking-wide text-muted-foreground">
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
          !stackedEmbed &&
            "aspect-[3/2] rounded-xl border border-border/80 bg-muted/40",
          stackedEmbed && "rounded-none border-0 bg-transparent",
        )}
        aria-label={
          stackedEmbed ? "Stacked library floors, 3D" : "Library floor, 3D"
        }>
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
            <div className="pointer-events-auto rounded-xl border border-border/80 bg-popover/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
              {selected ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {selected.id}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {selected.note}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {JOHN_ABBOTT_LIBRARY_SUBTITLE}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">
                    Select a room
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {JOHN_ABBOTT_LIBRARY_SUBTITLE}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
