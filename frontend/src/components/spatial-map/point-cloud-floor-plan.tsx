"use client";

import {
  JOHN_ABBOTT_3D_FLOORS,
  JOHN_ABBOTT_LIBRARY_STACK_GAP as STACK_GAP,
  JOHN_ABBOTT_LIBRARY_SUBTITLE,
  type LibraryRoom3D,
} from "@/lib/spatial/john-abbott-library-3d-data";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ── Constants ── */

const SCALE = 0.9;
const POINT_SIZE = 0.7;

/** Match `john-abbott-library-floor-three` stacked embed defaults. */
const ZOOM_RADIUS_MIN = 120;
const ZOOM_RADIUS_MAX = 1750;
const IDLE_ROT_RAD_PER_SEC = 0.085;
const IDLE_BOB_FREQ = 0.72;
const IDLE_BOB_AMP = 5.5;

/** Base gray intensity for all points — slight variation per-point for organic feel. */
const BASE_GRAY = 0.38;
const GRAY_VARIANCE = 0.12;

/* ── LiDAR-style point sampling ── */

/**
 * Sample points ONLY on the wall surfaces of a room (4 vertical planes).
 * Floor and ceiling are very sparse or absent — interior stays hollow.
 */
function sampleRoomWalls(
  room: LibraryRoom3D,
  yOffset: number,
  positions: number[],
  colors: number[],
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

  const floorConfigs: [keyof typeof JOHN_ABBOTT_3D_FLOORS, number][] = [
    ["bs", 0],
    ["f1", STACK_GAP],
  ];

  for (const [floorKey, yOff] of floorConfigs) {
    const floor = JOHN_ABBOTT_3D_FLOORS[floorKey];
    for (const room of floor.rooms) {
      sampleRoomWalls(room, yOff, positions, colors);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3,
  };
}

/* ── Heatmap pin from room data ── */

/**
 * Generate a heat-pin at a specific room location on the basement level.
 * Uses the actual room geometry from the 3D data to position correctly.
 *
 * basement-hallway-1 monitors the west corridor area — rooms 003 + 001 area.
 */
function generateHeatPin(yOffset: number) {
  const positions: number[] = [];
  const colors: number[] = [];

  // Use actual basement room positions to define the heat area.
  // basement-hallway-1 covers the corridor area around rooms 003/001/004.
  // Room 003: x=0, z=0, w=80, d=260 (west corridor)
  // We place the heat patch inside this corridor, scaled like the rooms.
  const heatX = 0 * SCALE;
  const heatZ = 60 * SCALE;
  const heatW = 80 * SCALE;
  const heatD = 140 * SCALE;

  const cx = heatX + heatW / 2;
  const cz = heatZ + heatD / 2;

  const jit = () => (Math.random() - 0.5) * 0.3;

  // ── Ground heat patch: dense points on the floor ──
  const heatStep = 0.8;
  for (let x = heatX; x <= heatX + heatW; x += heatStep) {
    for (let z = heatZ; z <= heatZ + heatD; z += heatStep) {
      // Heat intensity: hottest at center, fading to edges
      const dx = (x - cx) / (heatW / 2);
      const dz = (z - cz) / (heatD / 2);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const heat = Math.max(0, 1 - dist * 0.7);

      // Color: red-orange-yellow gradient
      const r = 0.9 + heat * 0.1;
      const g = 0.15 + heat * 0.55;
      const b = 0.03 + (1 - heat) * 0.08;

      positions.push(x + jit(), yOffset + 0.5 + jit() * 0.15, z + jit());
      colors.push(r, g, b);

      // Stacked glow layers
      if (Math.random() < 0.35) {
        positions.push(x + jit(), yOffset + 1.5 + Math.random() * 2, z + jit());
        colors.push(r * 0.7, g * 0.5, b * 0.2);
      }
    }
  }

  // ── Outline of the heat region ──
  const edgeStep = 0.4;
  const corners: [number, number][] = [
    [heatX, heatZ],
    [heatX + heatW, heatZ],
    [heatX + heatW, heatZ + heatD],
    [heatX, heatZ + heatD],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / edgeStep);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      positions.push(
        ax + (bx - ax) * t + jit() * 0.5,
        yOffset + 0.5 + jit() * 0.1,
        az + (bz - az) * t + jit() * 0.5,
      );
      colors.push(1.0, 0.4, 0.08);
    }
  }

  // ── Pin column: vertical beam from center ──
  const pinHeight = 40;
  const pinStep = 0.5;
  for (let y = 0; y <= pinHeight; y += pinStep) {
    const t = y / pinHeight;
    const radius = 3 * (1 - t * 0.7);
    const nPts = Math.max(3, Math.floor(10 * (1 - t * 0.5)));
    for (let i = 0; i < nPts; i++) {
      const angle = (i / nPts) * Math.PI * 2 + Math.random() * 0.5;
      const rad = radius * (0.4 + Math.random() * 0.6);
      positions.push(
        cx + Math.cos(angle) * rad,
        yOffset + 0.5 + y + jit() * 0.3,
        cz + Math.sin(angle) * rad,
      );
      const cr = 0.95 - t * 0.45;
      const cg = 0.3 + t * 0.2;
      const cb = 0.05 + t * 0.25;
      colors.push(cr, cg, cb);
    }
  }

  // ── Pin head: bright sphere at top ──
  const headY = yOffset + 0.5 + pinHeight;
  const headRadius = 5;
  for (let i = 0; i < 400; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = headRadius * (0.5 + Math.random() * 0.5);
    positions.push(
      cx + r * Math.sin(phi) * Math.cos(theta),
      headY + r * Math.cos(phi),
      cz + r * Math.sin(phi) * Math.sin(theta),
    );
    colors.push(1.0, 0.5, 0.12);
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3,
  };
}

/* ── Three.js scene management ── */

interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  points: THREE.Points;
  spherical: { theta: number; phi: number; radius: number };
  target: THREE.Vector3;
  animId: number;
  drag: boolean;
  prev: { x: number; y: number };
  idleT: number;
  idleBaseTarget: THREE.Vector3;
  idleBaseTheta: number;
  lastFrameMs: number;
}

function syncIdleAnchors(ctx: SceneCtx) {
  ctx.idleBaseTarget.copy(ctx.target);
  ctx.idleBaseTheta = ctx.spherical.theta;
  ctx.idleT = 0;
}

/** Same spherical orbit as the solid Herzberg model. */
function updateCamera(ctx: SceneCtx) {
  const { spherical, target, camera } = ctx;
  const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  const y = spherical.radius * Math.cos(spherical.phi);
  const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

/* ── Component ── */

export function PointCloudFloorPlan({
  className,
  /** Match dashboard column: size WebGL from host height instead of 3:2 aspect. */
  fillColumn = false,
}: {
  className?: string;
  fillColumn?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
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
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 5000);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
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

    const f1 = JOHN_ABBOTT_3D_FLOORS.f1;
    const bs = JOHN_ABBOTT_3D_FLOORS.bs;
    const midY = STACK_GAP * 0.52;
    const orbitTarget = new THREE.Vector3(
      (f1.target.x + bs.target.x) / 2,
      midY,
      (f1.target.z + bs.target.z) / 2,
    );

    const defaultOrbitRadius = fillColumn ? 1280 : 1000;

    const ctx: SceneCtx = {
      scene,
      camera,
      renderer,
      points,
      spherical: { theta: 0.6, phi: 1.0, radius: defaultOrbitRadius },
      target: orbitTarget.clone(),
      animId: 0,
      drag: false,
      prev: { x: 0, y: 0 },
      idleT: 0,
      idleBaseTarget: orbitTarget.clone(),
      idleBaseTheta: 0.6,
      lastFrameMs: performance.now(),
    };

    syncIdleAnchors(ctx);
    updateCamera(ctx);

    // Resize
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr?.width) return;
      const h =
        fillColumn && cr.height >= 80 ? Math.floor(cr.height) : Math.round((cr.width * 2) / 3);
      setSize(ctx, cr.width, h);
    });
    ro.observe(host);

    const w0 = host.clientWidth || 640;
    const rect0 = host.getBoundingClientRect();
    const h0 =
      fillColumn && rect0.height >= 80
        ? Math.floor(rect0.height)
        : Math.round((w0 * 2) / 3);
    setSize(ctx, w0, h0);

    // Render loop — idle orbit + bob (paused while dragging), same as solid stacked view
    const loop = () => {
      ctx.animId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.055, Math.max(0, (now - ctx.lastFrameMs) / 1000));
      ctx.lastFrameMs = now;
      if (!ctx.drag) {
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

    // Controls
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
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDrag = ctx.drag;
      if (wasDrag) {
        ctx.idleBaseTheta = ctx.spherical.theta;
        ctx.idleBaseTarget.copy(ctx.target);
        ctx.idleT = 0;
      }
      ctx.drag = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      ctx.spherical.radius = Math.max(
        ZOOM_RADIUS_MIN,
        Math.min(ZOOM_RADIUS_MAX, ctx.spherical.radius + e.deltaY * 0.45),
      );
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
  }, [setSize, fillColumn]);

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        fillColumn && "h-full min-h-0 flex-1",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200/80">
            {(pointCount / 1000).toFixed(1)}K points
          </span>
          <p className="text-[10px] tracking-wide text-white/35">Drag to orbit · scroll to zoom</p>
        </div>
      </div>

      <div
        ref={hostRef}
        className={cn(
          "relative w-full overflow-hidden bg-transparent",
          fillColumn
            ? "min-h-0 flex-1 rounded-none border-0"
            : "aspect-[3/2] rounded-xl border border-white/[0.06]",
        )}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none bg-transparent active:cursor-grabbing"
        />
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/35 px-3 py-2.5">
        <p className="text-sm font-medium text-white/75">Point cloud view</p>
        <p className="mt-0.5 text-[11px] text-white/40">{JOHN_ABBOTT_LIBRARY_SUBTITLE}</p>
      </div>
    </div>
  );
}
