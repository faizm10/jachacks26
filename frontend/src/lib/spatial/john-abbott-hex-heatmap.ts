import * as THREE from "three";
import {
  JOHN_ABBOTT_3D_FLOORS,
  type LibraryFloorKey,
} from "@/lib/spatial/john-abbott-library-3d-data";

// ── Vibe types ─────────────��─────────────────────────────────────────────────

export type VibeKind = "locked-in" | "social" | "collab" | "transit";

const VIBE_PALETTE: Record<VibeKind, { color: number; emissive: number }> = {
  "locked-in": { color: 0xef4444, emissive: 0x7f1d1d }, // red — matches Locked In label
  social:      { color: 0xf97316, emissive: 0x7c2d12 }, // orange — matches Social label
  collab:      { color: 0x8b5cf6, emissive: 0x4c1d95 }, // violet — matches Collaborative label
  transit:     { color: 0x64748b, emissive: 0x1e293b }, // slate — passing through
};

// ── Per-room simulation ──────────────────────────────────────────────────────
// Each room gets a density (0-1) and a weighted vibe mix.

interface RoomVibeSim {
  density: number; // 0–1, controls how many hex cells actually spawn a bar
  vibes: Partial<Record<VibeKind, number>>; // relative weights, will be normalised
}

// Core hotspots get high density + rich vibe mix.
// Peripheral rooms get very sparse bars.
const ROOM_SIMS: Record<string, RoomVibeSim> = {
  // ── 1st floor ────────────────────────���─────────────────────────────────
  // Main reading hall (core)
  "101":  { density: 0.55, vibes: { "locked-in": 0.6, collab: 0.25, social: 0.15 } },
  "101B": { density: 0.45, vibes: { "locked-in": 0.5, collab: 0.3, social: 0.2 } },
  "101A": { density: 0.3,  vibes: { collab: 0.5, "locked-in": 0.3, social: 0.2 } },
  "101C": { density: 0.35, vibes: { "locked-in": 0.65, collab: 0.25, social: 0.1 } },
  // East commons (core)
  "119":  { density: 0.6,  vibes: { social: 0.5, collab: 0.3, "locked-in": 0.2 } },
  // Corridor / service — very sparse
  "101D": { density: 0.08, vibes: { transit: 0.8, social: 0.2 } },
  "104":  { density: 0.12, vibes: { social: 0.4, transit: 0.6 } },
  "110":  { density: 0.05, vibes: { transit: 1 } },
  "111":  { density: 0.04, vibes: { transit: 1 } },
  "105":  { density: 0.03, vibes: { transit: 1 } },
  "115":  { density: 0.03, vibes: { transit: 1 } },
  // Study rooms — a few focused bars
  "102":  { density: 0.15, vibes: { "locked-in": 0.9, collab: 0.1 } },
  "103":  { density: 0.2,  vibes: { social: 0.5, "locked-in": 0.4, collab: 0.1 } },
  "112":  { density: 0.18, vibes: { "locked-in": 0.85, collab: 0.15 } },
  "114":  { density: 0.15, vibes: { "locked-in": 0.9, collab: 0.1 } },
  "116":  { density: 0.12, vibes: { "locked-in": 0.8, collab: 0.2 } },
  "118":  { density: 0.1,  vibes: { "locked-in": 0.85, collab: 0.15 } },
  "120":  { density: 0.1,  vibes: { "locked-in": 0.9, collab: 0.1 } },
  "122":  { density: 0.1,  vibes: { "locked-in": 0.9, collab: 0.1 } },

  // ── Basement ───────────────────────────────────────────────────────────
  // Open study core (core)
  "001":  { density: 0.55, vibes: { "locked-in": 0.45, social: 0.3, collab: 0.25 } },
  "002":  { density: 0.4,  vibes: { collab: 0.4, social: 0.35, "locked-in": 0.25 } },
  // East wing — lab & study (core)
  "024":  { density: 0.45, vibes: { "locked-in": 0.7, collab: 0.2, social: 0.1 } },
  "021":  { density: 0.3,  vibes: { social: 0.5, collab: 0.3, "locked-in": 0.2 } },
  // Foyer / service
  "004":  { density: 0.15, vibes: { transit: 0.5, social: 0.3, collab: 0.2 } },
  // Study rooms
  "014":  { density: 0.18, vibes: { "locked-in": 0.8, collab: 0.2 } },
  "016":  { density: 0.15, vibes: { "locked-in": 0.85, collab: 0.15 } },
  "018":  { density: 0.12, vibes: { "locked-in": 0.7, social: 0.3 } },
  "020":  { density: 0.15, vibes: { "locked-in": 0.8, collab: 0.2 } },
  "023":  { density: 0.12, vibes: { "locked-in": 0.75, collab: 0.25 } },
  "025":  { density: 0.1,  vibes: { "locked-in": 0.85, collab: 0.15 } },
  // Corridors / utility — barely anything
  "003":  { density: 0.02, vibes: { transit: 1 } },
  "005":  { density: 0.02, vibes: { transit: 1 } },
  "008":  { density: 0.03, vibes: { transit: 1 } },
  "010":  { density: 0.04, vibes: { transit: 0.8, social: 0.2 } },
  "011":  { density: 0.02, vibes: { transit: 1 } },
  "013":  { density: 0.02, vibes: { transit: 1 } },
  "015":  { density: 0.02, vibes: { transit: 1 } },
  "017":  { density: 0.02, vibes: { transit: 1 } },
  "030":  { density: 0.03, vibes: { transit: 1 } },
};

// ── Activity zones (kept for external label anchors) ─────────────────────────

export type ActivityZone = {
  id: string;
  label: string;
  color: number;
  accent: string;
  roomIds: string[];
  occupancy: number;
};

export const BASEMENT_ZONES: ActivityZone[] = [
  { id: "social", label: "Social", color: 0xf97316, accent: "#f97316",
    roomIds: ["001", "002", "021"], occupancy: 0.7 },
  { id: "locked-in", label: "Locked In", color: 0xef4444, accent: "#ef4444",
    roomIds: ["014", "016", "020", "023", "024", "025"], occupancy: 0.6 },
  { id: "collab", label: "Collaborative", color: 0x8b5cf6, accent: "#8b5cf6",
    roomIds: ["004", "018"], occupancy: 0.5 },
];

export const FIRST_FLOOR_ZONES: ActivityZone[] = [
  { id: "f1-social", label: "Social", color: 0xf97316, accent: "#f97316",
    roomIds: ["101", "101A", "101B", "101C", "119"], occupancy: 0.8 },
  { id: "f1-locked-in", label: "Locked In", color: 0xef4444, accent: "#ef4444",
    roomIds: ["112", "114", "116", "120", "122"], occupancy: 0.3 },
  { id: "f1-collab", label: "Collaborative", color: 0x8b5cf6, accent: "#8b5cf6",
    roomIds: ["103", "104"], occupancy: 0.55 },
];

// ── Geometry constants ───────────────────────────────────────────────────────

export const HEATMAP_SCALE = 0.9;

export const HEX_RADIUS = 3.5;
export const HEX_MAX_HEIGHT = 38;
export const HEX_PULSE_SPEED = 0.3;
export const HEX_PULSE_AMP = 0.12;

let _sharedHexUnitGeo: THREE.CylinderGeometry | null = null;

function getHexUnitGeometry(): THREE.CylinderGeometry {
  if (!_sharedHexUnitGeo) {
    _sharedHexUnitGeo = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 1, 6);
  }
  return _sharedHexUnitGeo;
}

// ── Hex grid helpers ─────────────────────────────────────────────────────────

export function hexGridCenters(
  rx: number, rz: number, rw: number, rd: number, radius: number,
): [number, number][] {
  const centers: [number, number][] = [];
  const dx = radius * 2;
  const dz = radius * Math.sqrt(3);
  let row = 0;
  for (let z = rz + radius; z < rz + rd - radius * 0.5; z += dz, row++) {
    const xOff = row % 2 === 0 ? 0 : radius;
    for (let x = rx + radius + xOff; x < rx + rw - radius * 0.5; x += dx) {
      centers.push([x, z]);
    }
  }
  return centers;
}

// ── Seeded random for deterministic distribution ─────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a vibe kind from weighted mix. */
function pickVibe(vibes: Partial<Record<VibeKind, number>>, rand: () => number): VibeKind {
  const entries = Object.entries(vibes) as [VibeKind, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [kind, weight] of entries) {
    r -= weight;
    if (r <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}

// ── Build hex columns per floor ──────────────────��───────────────────────────

export function appendHexColumnsForFloor(
  scene: THREE.Scene,
  out: THREE.Mesh[],
  floorKey: LibraryFloorKey,
  _zones: readonly ActivityZone[],
  yOffset: number,
) {
  const rooms = JOHN_ABBOTT_3D_FLOORS[floorKey].rooms;
  const unitGeo = getHexUnitGeometry();

  for (const room of rooms) {
    // Skip rooms that are data-driven from video analysis
    if (DATA_DRIVEN_ROOMS.has(room.id)) continue;
    const sim = ROOM_SIMS[room.id];
    if (!sim || sim.density <= 0) continue;

    const rx = room.x * HEATMAP_SCALE;
    const rz = room.z * HEATMAP_SCALE;
    const rw = room.w * HEATMAP_SCALE;
    const rd = room.d * HEATMAP_SCALE;
    const roofY = room.h * 5 + yOffset;
    const centers = hexGridCenters(rx, rz, rw, rd, HEX_RADIUS);

    // Seeded random per room for deterministic look
    const rng = mulberry32(room.id.charCodeAt(0) * 1000 + (room.id.charCodeAt(1) || 0) * 31 + yOffset);

    for (const [cx, cz] of centers) {
      // Stochastic spawn — only `density` fraction of cells get a bar
      if (rng() > sim.density) continue;

      // Pick a vibe for this bar
      const vibe = pickVibe(sim.vibes, rng);
      const palette = VIBE_PALETTE[vibe];

      // Height driven by density + per-bar jitter — higher = denser population
      const jitter = 0.6 + rng() * 0.8;
      const h = sim.density * HEX_MAX_HEIGHT * jitter;
      if (h < 1.5) continue;

      // Slight colour variance per bar for organic feel
      const baseColor = new THREE.Color(palette.color);
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      hsl.h += (rng() - 0.5) * 0.06;  // ±3% hue shift
      hsl.s = Math.min(1, hsl.s + (rng() - 0.5) * 0.15);
      hsl.l = Math.min(1, Math.max(0, hsl.l + (rng() - 0.5) * 0.12));
      baseColor.setHSL(hsl.h, hsl.s, hsl.l);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.65 + sim.density * 0.25,
        roughness: 0.5,
        metalness: 0.15,
        emissive: new THREE.Color(palette.emissive),
        emissiveIntensity: 0.5 + sim.density * 0.5,
      });

      const mesh = new THREE.Mesh(unitGeo, mat);
      mesh.scale.set(1, h, 1);
      mesh.position.set(cx, roofY + h / 2, cz);
      mesh.userData = {
        zoneId: vibe,
        baseHeight: h,
        phaseOffset: rng() * Math.PI * 2,
      };
      mesh.raycast = () => {};
      scene.add(mesh);
      out.push(mesh);
    }
  }
}

// ── Data-driven bars from video analysis ─────────────────────────────────────

/** A single person detected from video analysis, mapped to a room. */
export interface LivePersonBar {
  /** Room ID this person is in (e.g. "101", "001") */
  roomId: string;
  /** Foot position within room bounds, normalized 0-1 */
  footX: number;
  footZ: number;
  /** Activity string from Gemini (mapped to VibeKind) */
  activity: string;
  /** Detection confidence 0-1 */
  confidence: number;
}

/** Map Gemini activity labels → vibe colours. */
function activityToVibe(activity: string): VibeKind {
  const a = activity.toLowerCase();
  if (a.includes("typing") || a.includes("reading") || a.includes("writing") ||
      a.includes("studying") || a.includes("laptop") || a.includes("focus") ||
      a.includes("sitting") || a.includes("working"))
    return "locked-in";
  if (a.includes("talk") || a.includes("chat") || a.includes("social") ||
      a.includes("laugh") || a.includes("group") || a.includes("convers") ||
      a.includes("eating") || a.includes("phone"))
    return "social";
  if (a.includes("collab") || a.includes("present") || a.includes("whiteboard") ||
      a.includes("discuss") || a.includes("help") || a.includes("pair"))
    return "collab";
  return "transit";
}

/** Rooms driven by live video data — skip these in the hardcoded path. */
export const DATA_DRIVEN_ROOMS = new Set<string>(["101", "101B", "101D", "001"]);

/** Place bars on hex grid cells from video analysis — one bar per person.
 *  Each person is assigned to the nearest unoccupied hex cell in their room.
 *  If more people than cells, extra people stack onto existing cells (taller bar). */
export function appendLiveHexColumns(
  scene: THREE.Scene,
  out: THREE.Mesh[],
  floorKey: LibraryFloorKey,
  persons: LivePersonBar[],
  yOffset: number,
) {
  const rooms = JOHN_ABBOTT_3D_FLOORS[floorKey].rooms;
  const unitGeo = getHexUnitGeometry();
  const rng = mulberry32(42);

  console.log(`[LiveHex] appendLiveHexColumns floor=${floorKey}, persons=${persons.length}`);

  // Group persons by room
  const byRoom = new Map<string, LivePersonBar[]>();
  for (const p of persons) {
    const list = byRoom.get(p.roomId) ?? [];
    list.push(p);
    byRoom.set(p.roomId, list);
  }

  for (const [roomId, roomPersons] of byRoom) {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) continue;

    const rx = room.x * HEATMAP_SCALE;
    const rz = room.z * HEATMAP_SCALE;
    const rw = room.w * HEATMAP_SCALE;
    const rd = room.d * HEATMAP_SCALE;
    const roofY = room.h * 5 + yOffset;

    // Pre-compute all hex grid cells for this room
    const centers = hexGridCenters(rx, rz, rw, rd, HEX_RADIUS);
    console.log(`[LiveHex] Room ${roomId}: ${roomPersons.length} people, ${centers.length} hex cells available, room(${room.x},${room.z},${room.w},${room.d}) scaled(${rx.toFixed(0)},${rz.toFixed(0)},${rw.toFixed(0)},${rd.toFixed(0)})`);
    if (centers.length === 0) continue;

    // For each cell, track: vibe, person count, total confidence
    const cellData: { cx: number; cz: number; vibe: VibeKind; count: number; conf: number }[] = [];
    const occupied = new Set<number>();

    // Assign each person to nearest unoccupied cell
    for (const person of roomPersons) {
      const targetX = rx + person.footX * rw;
      const targetZ = rz + person.footZ * rd;
      const vibe = activityToVibe(person.activity);

      // Find nearest unoccupied cell
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < centers.length; i++) {
        if (occupied.has(i)) continue;
        const dx = centers[i][0] - targetX;
        const dz = centers[i][1] - targetZ;
        const d = dx * dx + dz * dz;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        // New cell
        occupied.add(bestIdx);
        cellData.push({
          cx: centers[bestIdx][0],
          cz: centers[bestIdx][1],
          vibe,
          count: 1,
          conf: person.confidence,
        });
      } else {
        // All cells occupied — stack onto the nearest existing cell (makes it taller)
        let nearestCell = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < cellData.length; i++) {
          const dx = cellData[i].cx - targetX;
          const dz = cellData[i].cz - targetZ;
          const d = dx * dx + dz * dz;
          if (d < nearestDist) {
            nearestDist = d;
            nearestCell = i;
          }
        }
        cellData[nearestCell].count++;
        cellData[nearestCell].conf = Math.max(cellData[nearestCell].conf, person.confidence);
      }
    }

    console.log(`[LiveHex] Room ${roomId}: ${cellData.length} cells occupied, stacked=${roomPersons.length - cellData.length}`);

    // Render a bar for each occupied cell
    for (const cell of cellData) {
      const palette = VIBE_PALETTE[cell.vibe];

      // Height scales with person count at this cell
      const h = HEX_MAX_HEIGHT * (0.4 + cell.conf * 0.3) * (0.8 + cell.count * 0.25) * (0.85 + rng() * 0.3);
      if (h < 1.5) continue;

      const baseColor = new THREE.Color(palette.color);
      const hsl = { h: 0, s: 0, l: 0 };
      baseColor.getHSL(hsl);
      hsl.h += (rng() - 0.5) * 0.06;
      hsl.s = Math.min(1, hsl.s + (rng() - 0.5) * 0.15);
      hsl.l = Math.min(1, Math.max(0, hsl.l + (rng() - 0.5) * 0.12));
      baseColor.setHSL(hsl.h, hsl.s, hsl.l);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.7 + cell.conf * 0.2,
        roughness: 0.5,
        metalness: 0.15,
        emissive: new THREE.Color(palette.emissive),
        emissiveIntensity: 0.5 + cell.conf * 0.5,
      });

      const mesh = new THREE.Mesh(unitGeo, mat);
      mesh.scale.set(1, h, 1);
      mesh.position.set(cell.cx, roofY + h / 2, cell.cz);
      mesh.userData = {
        zoneId: cell.vibe,
        baseHeight: h,
        phaseOffset: rng() * Math.PI * 2,
      };
      mesh.raycast = () => {};
      scene.add(mesh);
      out.push(mesh);
    }
  }
}

/** Removes meshes and disposes materials only (shared unit geometry is not disposed). */
export function disposeHexColumnMeshes(scene: THREE.Scene, columns: THREE.Mesh[]) {
  for (const m of columns) {
    scene.remove(m);
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => (x as THREE.Material).dispose());
    else (mat as THREE.Material).dispose();
  }
  columns.length = 0;
}

export function createJohnAbbottActivityHexes(
  scene: THREE.Scene,
  out: THREE.Mesh[],
  bsYOffset: number,
  f1YOffset: number | null,
  livePersons?: LivePersonBar[],
) {
  disposeHexColumnMeshes(scene, out);

  // Hardcoded rooms (skips DATA_DRIVEN_ROOMS)
  appendHexColumnsForFloor(scene, out, "bs", BASEMENT_ZONES, bsYOffset);
  if (f1YOffset !== null) {
    appendHexColumnsForFloor(scene, out, "f1", FIRST_FLOOR_ZONES, f1YOffset);
  }

  // Data-driven rooms from video analysis
  if (livePersons && livePersons.length > 0) {
    const bsPersons = livePersons.filter((p) => {
      const bsRooms = JOHN_ABBOTT_3D_FLOORS.bs.rooms;
      return bsRooms.some((r) => r.id === p.roomId);
    });
    const f1Persons = livePersons.filter((p) => {
      const f1Rooms = JOHN_ABBOTT_3D_FLOORS.f1.rooms;
      return f1Rooms.some((r) => r.id === p.roomId);
    });
    if (bsPersons.length > 0) {
      appendLiveHexColumns(scene, out, "bs", bsPersons, bsYOffset);
    }
    if (f1YOffset !== null && f1Persons.length > 0) {
      appendLiveHexColumns(scene, out, "f1", f1Persons, f1YOffset);
    }
  }

  syncHexColumnBaseYs(out);
}

export function syncHexColumnBaseYs(columns: THREE.Mesh[]) {
  for (const col of columns) {
    (col.userData as Record<string, number>).baseY = col.position.y;
  }
}

export function pulseHexColumns(columns: THREE.Mesh[], idleT: number) {
  for (const col of columns) {
    const ud = col.userData as { baseHeight: number; baseY: number; phaseOffset: number };
    const pulse = 1 + HEX_PULSE_AMP * Math.sin(idleT * HEX_PULSE_SPEED * Math.PI * 2 + ud.phaseOffset);
    const h = ud.baseHeight * pulse;
    col.scale.y = h;
    col.position.y = ud.baseY - ud.baseHeight / 2 + h / 2;
  }
}

// ── Zone label anchors (unchanged API) ────────────────��──────────────────────

export type ZoneLabelAnchor = {
  id: string;
  label: string;
  accent: string;
  world: THREE.Vector3;
};

export function getZoneLabelAnchors(bsYOffset: number, f1YOffset: number | null): ZoneLabelAnchor[] {
  const anchors: ZoneLabelAnchor[] = [];

  const collect = (zones: readonly ActivityZone[], floorKey: LibraryFloorKey, yOff: number) => {
    const rooms = JOHN_ABBOTT_3D_FLOORS[floorKey].rooms;
    for (const zone of zones) {
      let bestRoom: (typeof rooms)[number] | null = null;
      let bestArea = 0;
      for (const roomId of zone.roomIds) {
        const room = rooms.find((r) => r.id === roomId);
        if (!room) continue;
        const area = room.w * room.d;
        if (area > bestArea) {
          bestArea = area;
          bestRoom = room;
        }
      }
      if (!bestRoom) continue;
      const cx = bestRoom.x * HEATMAP_SCALE + (bestRoom.w * HEATMAP_SCALE) / 2;
      const cz = bestRoom.z * HEATMAP_SCALE + (bestRoom.d * HEATMAP_SCALE) / 2;
      const topY = bestRoom.h * 5 + yOff + zone.occupancy * HEX_MAX_HEIGHT + 18;
      anchors.push({
        id: zone.id,
        label: zone.label,
        accent: zone.accent,
        world: new THREE.Vector3(cx, topY, cz),
      });
    }
  };

  collect(BASEMENT_ZONES, "bs", bsYOffset);
  if (f1YOffset !== null) {
    collect(FIRST_FLOOR_ZONES, "f1", f1YOffset);
  }
  return anchors;
}

export type CanvasWorldLabel = { el: HTMLDivElement; world: THREE.Vector3 };

const _proj = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _camDir = new THREE.Vector3();

export function updateCanvasWorldLabels(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  entries: CanvasWorldLabel[],
) {
  if (!entries.length) return;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_camPos);
  camera.getWorldDirection(_camDir);
  for (const { el, world } of entries) {
    _toPoint.copy(world).sub(_camPos).normalize();
    const faceDot = _toPoint.dot(_camDir);
    const facing = faceDot > 0.06;
    _proj.copy(world).project(camera);
    const m = 0.08;
    const inFrustum =
      _proj.z > -1 &&
      _proj.z < 1 &&
      _proj.x > -1 + m &&
      _proj.x < 1 - m &&
      _proj.y > -1 + m &&
      _proj.y < 1 - m;
    if (!facing || !inFrustum) {
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      continue;
    }
    el.style.visibility = "visible";
    const face01 = Math.min(1, Math.max(0, (faceDot - 0.06) / 0.5));
    const scale = 0.9 + 0.1 * face01;
    el.style.opacity = String(0.5 + 0.48 * face01);
    const px = (_proj.x * 0.5 + 0.5) * w;
    const py = (-_proj.y * 0.5 + 0.5) * h;
    el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -118%) scale(${scale.toFixed(4)})`;
  }
}
