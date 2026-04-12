"use client";

import {
  JOHN_ABBOTT_3D_FLOORS,
  JOHN_ABBOTT_LIBRARY_SUBTITLE,
  type LibraryFloorKey,
  type LibraryRoom3D,
} from "@/lib/spatial/john-abbott-library-3d-data";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ── Constants ── */

const SCALE = 0.9;
const STACK_GAP = 58;
const POINT_SIZE = 0.7;

/** Base gray intensity for all points — slight variation per-point for organic feel. */
const BASE_GRAY = 0.38;
const GRAY_VARIANCE = 0.12;

type FloorFocus = "all" | LibraryFloorKey;

/* ── LiDAR-style point sampling ── */

/**
 * Sample points ONLY on the wall surfaces of a room (4 vertical planes).
 * Floor and ceiling are very sparse or absent — interior stays hollow.
 */
function sampleRoomWalls(
  room: LibraryRoom3D,
  yOffset: number,
  floorKey: LibraryFloorKey,
  positions: number[],
  colors: number[],
  floors: LibraryFloorKey[],
) {
  const x0 = room.x * SCALE;
  const z0 = room.z * SCALE;
  const w = room.w * SCALE;
  const d = room.d * SCALE;
  const h = room.h * 10;
  const yBase = yOffset;
  const yTop = yBase + h;

  // Wall density — denser = more scan-like
  const wallStep = 1.0;
  // Noise amplitude — gives the organic LiDAR scatter
  const noise = 0.4;
  const jit = () => (Math.random() - 0.5) * noise;
  // Per-point color variation
  const gray = () => {
    const g = BASE_GRAY + (Math.random() - 0.5) * GRAY_VARIANCE;
    return g;
  };

  const addPt = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    const g = gray();
    colors.push(g, g, g);
    floors.push(floorKey);
  };

  // ── 4 walls (dense) ──

  // Front wall (z = z0)
  for (let x = 0; x <= w; x += wallStep) {
    for (let y = yBase; y <= yTop; y += wallStep) {
      addPt(x0 + x + jit(), y + jit(), z0 + jit());
    }
  }
  // Back wall (z = z0 + d)
  for (let x = 0; x <= w; x += wallStep) {
    for (let y = yBase; y <= yTop; y += wallStep) {
      addPt(x0 + x + jit(), y + jit(), z0 + d + jit());
    }
  }
  // Left wall (x = x0)
  for (let z = 0; z <= d; z += wallStep) {
    for (let y = yBase; y <= yTop; y += wallStep) {
      addPt(x0 + jit(), y + jit(), z0 + z + jit());
    }
  }
  // Right wall (x = x0 + w)
  for (let z = 0; z <= d; z += wallStep) {
    for (let y = yBase; y <= yTop; y += wallStep) {
      addPt(x0 + w + jit(), y + jit(), z0 + z + jit());
    }
  }

  // ── Floor — very sparse so interior reads as empty ──
  const floorStep = 4.0;
  for (let x = 0; x <= w; x += floorStep) {
    for (let z = 0; z <= d; z += floorStep) {
      if (Math.random() > 0.4) continue; // skip most points
      addPt(x0 + x + jit(), yBase + jit() * 0.2, z0 + z + jit());
    }
  }

  // ── Ceiling — sparse ──
  for (let x = 0; x <= w; x += floorStep) {
    for (let z = 0; z <= d; z += floorStep) {
      if (Math.random() > 0.3) continue;
      addPt(x0 + x + jit(), yTop + jit() * 0.2, z0 + z + jit());
    }
  }

  // ── Vertical edges (denser — corners accumulate more scan hits) ──
  const edgeStep = 0.5;
  const edgeNoise = 0.25;
  const ejit = () => (Math.random() - 0.5) * edgeNoise;
  const corners = [
    [x0, z0],
    [x0 + w, z0],
    [x0 + w, z0 + d],
    [x0, z0 + d],
  ] as const;

  for (const [cx, cz] of corners) {
    for (let y = yBase; y <= yTop; y += edgeStep) {
      addPt(cx + ejit(), y + ejit(), cz + ejit());
    }
  }
}

function generateAllPoints() {
  const positions: number[] = [];
  const colors: number[] = [];
  const floors: LibraryFloorKey[] = [];

  const floorConfigs: [LibraryFloorKey, number][] = [
    ["bs", 0],
    ["f1", STACK_GAP],
  ];

  for (const [floorKey, yOff] of floorConfigs) {
    const floor = JOHN_ABBOTT_3D_FLOORS[floorKey];
    for (const room of floor.rooms) {
      sampleRoomWalls(room, yOff, floorKey, positions, colors, floors);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    floors,
    count: positions.length / 3,
  };
}

/* ── Three.js scene management ── */

interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  points: THREE.Points;
  baseColors: Float32Array;
  floors: LibraryFloorKey[];
  spherical: { theta: number; phi: number; radius: number };
  target: THREE.Vector3;
  animId: number;
  drag: boolean;
  prev: { x: number; y: number };
}

function updateCamera(ctx: SceneCtx) {
  const { spherical, target, camera } = ctx;
  const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  const y = target.y + spherical.radius * Math.cos(spherical.phi);
  const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

function applyFocus(ctx: SceneCtx, focus: FloorFocus) {
  const geo = ctx.points.geometry;
  const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute;
  const arr = colorAttr.array as Float32Array;

  for (let i = 0; i < ctx.floors.length; i++) {
    const floorKey = ctx.floors[i];
    const inFocus = focus === "all" || floorKey === focus;
    const dim = inFocus ? 1.0 : 0.1;
    arr[i * 3] = ctx.baseColors[i * 3] * dim;
    arr[i * 3 + 1] = ctx.baseColors[i * 3 + 1] * dim;
    arr[i * 3 + 2] = ctx.baseColors[i * 3 + 2] * dim;
  }
  colorAttr.needsUpdate = true;

  if (focus === "all") {
    ctx.target.set(380, STACK_GAP * 0.5, 180);
  } else if (focus === "f1") {
    ctx.target.set(380, STACK_GAP, 180);
  } else {
    ctx.target.set(400, 0, 160);
  }
  updateCamera(ctx);
}

/* ── Component ── */

export function PointCloudFloorPlan({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const [focus, setFocus] = useState<FloorFocus>("all");
  const [pointCount, setPointCount] = useState(0);

  const setSize = useCallback((ctx: SceneCtx, w: number, h: number) => {
    ctx.camera.aspect = w / h;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(w, h);
  }, []);

  // Init scene
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0f14);

    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    scene.add(new THREE.AmbientLight(0xc8d4e8, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(300, 520, -180);
    scene.add(sun);

    // Generate point cloud
    const data = generateAllPoints();
    setPointCount(data.count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(data.colors.slice(), 3));

    const mat = new THREE.PointsMaterial({
      size: POINT_SIZE,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const ctx: SceneCtx = {
      scene,
      camera,
      renderer,
      points,
      baseColors: data.colors,
      floors: data.floors,
      spherical: { theta: 0.6, phi: 0.75, radius: 650 },
      target: new THREE.Vector3(380, STACK_GAP * 0.5, 180),
      animId: 0,
      drag: false,
      prev: { x: 0, y: 0 },
    };

    updateCamera(ctx);

    // Resize
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr?.width) return;
      setSize(ctx, cr.width, Math.round((cr.width * 2) / 3));
    });
    ro.observe(host);

    const w0 = host.clientWidth || 640;
    setSize(ctx, w0, Math.round((w0 * 2) / 3));

    // Render loop
    const loop = () => {
      ctx.animId = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();

    // Controls
    const onPointerDown = (e: PointerEvent) => {
      ctx.drag = false;
      ctx.prev = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 1) return;
      const dx = e.clientX - ctx.prev.x;
      const dy = e.clientY - ctx.prev.y;
      ctx.drag = true;
      ctx.spherical.theta -= dx * 0.008;
      ctx.spherical.phi = Math.max(0.15, Math.min(1.5, ctx.spherical.phi + dy * 0.008));
      updateCamera(ctx);
      ctx.prev = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      ctx.spherical.radius = Math.max(150, Math.min(1200, ctx.spherical.radius + e.deltaY * 0.45));
      updateCamera(ctx);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });

    ctxRef.current = ctx;

    return () => {
      cancelAnimationFrame(ctx.animId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      ctxRef.current = null;
    };
  }, [setSize]);

  // Apply focus
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    applyFocus(ctx, focus);
  }, [focus]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex gap-0.5 rounded-lg border border-white/[0.08] bg-black/40 p-0.5"
          role="tablist"
          aria-label="Floor focus"
        >
          {(
            [
              ["all", "All floors"],
              ["f1", "1st floor"],
              ["bs", "Basement"],
            ] as [FloorFocus, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={focus === key}
              onClick={() => setFocus(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                focus === key
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/45 hover:bg-white/[0.06] hover:text-white/75",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">
            {(pointCount / 1000).toFixed(1)}K points
          </span>
          <p className="text-[10px] tracking-wide text-white/35">
            Drag to orbit · scroll to zoom
          </p>
        </div>
      </div>

      <div
        ref={hostRef}
        className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#0c0f14]"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
        />
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/35 px-3 py-2.5">
        <p className="text-sm font-medium text-white/75">Point cloud view</p>
        <p className="mt-0.5 text-[11px] text-white/40">{JOHN_ABBOTT_LIBRARY_SUBTITLE}</p>
      </div>
    </div>
  );
}
