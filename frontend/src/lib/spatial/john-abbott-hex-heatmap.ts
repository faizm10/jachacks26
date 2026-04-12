import * as THREE from "three";
import {
  JOHN_ABBOTT_3D_FLOORS,
  type LibraryFloorKey,
} from "@/lib/spatial/john-abbott-library-3d-data";

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

/** Same scale as room geometry in the 3D viewers. */
export const HEATMAP_SCALE = 0.9;

export const HEX_RADIUS = 6;
export const HEX_MAX_HEIGHT = 35;
export const HEX_PULSE_SPEED = 0.9;
export const HEX_PULSE_AMP = 0.18;

let _sharedHexUnitGeo: THREE.CylinderGeometry | null = null;

function getHexUnitGeometry(): THREE.CylinderGeometry {
  if (!_sharedHexUnitGeo) {
    _sharedHexUnitGeo = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 1, 6);
  }
  return _sharedHexUnitGeo;
}

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

export function appendHexColumnsForFloor(
  scene: THREE.Scene,
  out: THREE.Mesh[],
  floorKey: LibraryFloorKey,
  zones: readonly ActivityZone[],
  yOffset: number,
) {
  const rooms = JOHN_ABBOTT_3D_FLOORS[floorKey].rooms;
  const unitGeo = getHexUnitGeometry();

  for (const zone of zones) {
    const baseColor = new THREE.Color(zone.color);
    const emissiveColor = baseColor.clone().multiplyScalar(0.35);

    for (const roomId of zone.roomIds) {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) continue;

      const rx = room.x * HEATMAP_SCALE;
      const rz = room.z * HEATMAP_SCALE;
      const rw = room.w * HEATMAP_SCALE;
      const rd = room.d * HEATMAP_SCALE;
      const roofY = room.h * 5 + yOffset;
      const centers = hexGridCenters(rx, rz, rw, rd, HEX_RADIUS);

      for (const [cx, cz] of centers) {
        const jitter = 0.75 + Math.random() * 0.5;
        const h = zone.occupancy * HEX_MAX_HEIGHT * jitter;
        if (h < 1) continue;

        const mat = new THREE.MeshStandardMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0.72 + zone.occupancy * 0.2,
          roughness: 0.5,
          metalness: 0.15,
          emissive: emissiveColor,
          emissiveIntensity: 0.6 + zone.occupancy * 0.4,
        });

        const mesh = new THREE.Mesh(unitGeo, mat);
        mesh.scale.set(1, h, 1);
        mesh.position.set(cx, roofY + h / 2, cz);
        mesh.userData = {
          zoneId: zone.id,
          baseHeight: h,
          phaseOffset: Math.random() * Math.PI * 2,
        };
        mesh.raycast = () => {};
        scene.add(mesh);
        out.push(mesh);
      }
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
) {
  disposeHexColumnMeshes(scene, out);
  appendHexColumnsForFloor(scene, out, "bs", BASEMENT_ZONES, bsYOffset);
  if (f1YOffset !== null) {
    appendHexColumnsForFloor(scene, out, "f1", FIRST_FLOOR_ZONES, f1YOffset);
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
