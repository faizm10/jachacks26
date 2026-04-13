/**
 * John Abbott College Library — 3D floor data (ported from `john_abbott_threejs_3d.html`).
 * Single source of truth for the Spatial Map Three.js view.
 */

export type LibraryRoomType = "open" | "study" | "hall" | "exit" | "evac" | "service";

export interface LibraryRoom3D {
  id: string;
  type: LibraryRoomType;
  note: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface LibraryFloor3D {
  rooms: LibraryRoom3D[];
  /** Orbit target (scene units) — keeps camera framed on this floor’s mass */
  target: { x: number; y: number; z: number };
}

export const JOHN_ABBOTT_3D_FLOORS = {
  f1: {
    target: { x: 380, y: 0, z: 180 },
    rooms: [
      { id: "101B", type: "open", note: "Main open library — reading floor and stacks", x: 0, z: 0, w: 310, d: 40, h: 2.2 },
      { id: "101", type: "open", note: "Main open library floor — reading tables", x: 0, z: 40, w: 220, d: 180, h: 2.2 },
      { id: "101A", type: "open", note: "Open library sub-section — south west", x: 0, z: 220, w: 100, d: 80, h: 2.2 },
      { id: "101C", type: "open", note: "Study carrels and open reading area", x: 100, z: 220, w: 100, d: 80, h: 2.2 },
      { id: "101D", type: "hall", note: "Central corridor — links west and east wings", x: 220, z: 80, w: 110, d: 140, h: 2.2 },
      { id: "102", type: "study", note: "Room 102 — staff and admin offices", x: 310, z: 0, w: 130, d: 80, h: 2.8 },
      { id: "103", type: "study", note: "Room 103 — group study room", x: 100, z: 300, w: 120, d: 80, h: 2.8 },
      { id: "104", type: "service", note: "Room 104 — central service and help desk", x: 330, z: 80, w: 90, d: 80, h: 2.8 },
      { id: "105", type: "hall", note: "Room 105 — stairwell near Exit 3", x: 220, z: 300, w: 80, d: 80, h: 2.2 },
      { id: "110", type: "hall", note: "Room 110 — corridor to east wing", x: 420, z: 80, w: 80, d: 80, h: 2.2 },
      { id: "111", type: "hall", note: "Room 111 — elevator lobby (do not use in fire)", x: 420, z: 160, w: 80, d: 100, h: 2.2 },
      { id: "112", type: "study", note: "Room 112 — study room, east wing", x: 500, z: 0, w: 80, d: 80, h: 2.8 },
      { id: "113", type: "exit", note: "Room 113 — fire hose and pull station", x: 300, z: 300, w: 60, d: 80, h: 2.2 },
      { id: "114", type: "study", note: "Room 114 — study room, east wing", x: 580, z: 0, w: 80, d: 80, h: 2.8 },
      { id: "115", type: "hall", note: "Room 115 — washrooms and corridor", x: 420, z: 260, w: 80, d: 80, h: 2.2 },
      { id: "116", type: "study", note: "Room 116 — study room, far east", x: 660, z: 0, w: 100, d: 80, h: 2.8 },
      { id: "118", type: "study", note: "Room 118 — study room, east lower", x: 660, z: 80, w: 100, d: 80, h: 2.8 },
      { id: "119", type: "open", note: "Room 119 — large open east area", x: 500, z: 80, w: 260, d: 200, h: 2.2 },
      { id: "120", type: "study", note: "Room 120 — study room, east mid", x: 580, z: 0, w: 80, d: 80, h: 2.8 },
      { id: "122", type: "study", note: "Room 122 — study room, east mid", x: 500, z: 0, w: 80, d: 80, h: 2.8 },
      { id: "EXIT 1", type: "exit", note: "Emergency exit — west end", x: -10, z: 140, w: 10, d: 40, h: 2.2 },
      { id: "EXIT 2", type: "exit", note: "Emergency exit — north centre", x: 370, z: -10, w: 40, d: 10, h: 2.2 },
      { id: "EXIT 3", type: "exit", note: "Emergency exit — south centre", x: 220, z: 390, w: 80, d: 10, h: 2.2 },
      { id: "EXIT 4", type: "exit", note: "Emergency exit — east end", x: 760, z: 60, w: 10, d: 40, h: 2.2 },
    ],
  },
  bs: {
    target: { x: 400, y: 0, z: 160 },
    rooms: [
      { id: "002", type: "open", note: "Room 002 — open reading and lounge area", x: 80, z: 0, w: 200, d: 120, h: 2.4 },
      { id: "003", type: "hall", note: "Room 003 — west utility and storage", x: 0, z: 0, w: 80, d: 260, h: 2.4 },
      { id: "001", type: "open", note: "Room 001 — central open study area", x: 80, z: 120, w: 180, d: 120, h: 2.4 },
      { id: "004", type: "service", note: "Room 004 — You Are Here · central foyer", x: 260, z: 120, w: 130, d: 80, h: 2.4 },
      { id: "005", type: "exit", note: "Room 005 — Exit 3 stairwell · evacuation route", x: 280, z: 280, w: 80, d: 80, h: 2.4 },
      { id: "008", type: "exit", note: "Room 008 — corridor to Exit 2 stairwell", x: 390, z: 0, w: 80, d: 120, h: 2.4 },
      { id: "010", type: "hall", note: "Room 010 — corridor · first aid kit location", x: 390, z: 120, w: 80, d: 80, h: 2.4 },
      { id: "011", type: "hall", note: "Room 011 — elevator lobby (do not use in fire)", x: 470, z: 240, w: 80, d: 80, h: 2.4 },
      { id: "013", type: "evac", note: "Room 013 — evacuation corridor to Exit 3", x: 330, z: 200, w: 80, d: 160, h: 2.4 },
      { id: "014", type: "study", note: "Room 014 — study room, east", x: 530, z: 120, w: 90, d: 80, h: 2.8 },
      { id: "015", type: "hall", note: "Room 015 — elevator area (do not use in fire)", x: 470, z: 160, w: 80, d: 80, h: 2.4 },
      { id: "016", type: "study", note: "Room 016 — study room, upper east", x: 530, z: 0, w: 100, d: 80, h: 2.8 },
      { id: "017", type: "hall", note: "Room 017 — washrooms and utility, east", x: 470, z: 320, w: 80, d: 80, h: 2.4 },
      { id: "018", type: "study", note: "Room 018 — admin and study office", x: 470, z: 80, w: 80, d: 80, h: 2.8 },
      { id: "020", type: "study", note: "Room 020 — study area, north east", x: 630, z: 0, w: 90, d: 80, h: 2.8 },
      { id: "021", type: "open", note: "Room 021 — open east area", x: 620, z: 120, w: 80, d: 80, h: 2.4 },
      { id: "023", type: "study", note: "Room 023 — study room, east", x: 620, z: 280, w: 80, d: 80, h: 2.8 },
      { id: "024", type: "study", note: "Room 024 — computer lab and large study", x: 720, z: 0, w: 80, d: 160, h: 2.8 },
      { id: "025", type: "study", note: "Room 025 — group study, far east", x: 700, z: 280, w: 80, d: 80, h: 2.8 },
      { id: "030", type: "hall", note: "Room 030 — far east storage room", x: 700, z: 160, w: 80, d: 120, h: 2.4 },
      { id: "EXIT 1", type: "exit", note: "Emergency exit — west end", x: -10, z: 100, w: 10, d: 40, h: 2.4 },
      { id: "EXIT 2", type: "exit", note: "Emergency exit — north centre", x: 400, z: -10, w: 40, d: 10, h: 2.4 },
      { id: "EXIT 3", type: "exit", note: "Emergency exit — south (via 005)", x: 280, z: 360, w: 80, d: 10, h: 2.4 },
      { id: "EXIT 4", type: "exit", note: "Emergency exit — east end", x: 760, z: 60, w: 10, d: 40, h: 2.4 },
    ],
  },
} as const satisfies Record<string, LibraryFloor3D>;

export type LibraryFloorKey = keyof typeof JOHN_ABBOTT_3D_FLOORS;

/** Vertical separation between basement and 1st floor in stacked Herzberg views (scene units). */
export const JOHN_ABBOTT_LIBRARY_STACK_GAP = 174;

/** Original prototype colors (hex) — reference only */
export const JOHN_ABBOTT_3D_MATS = {
  open: { color: 0xfafafa, opacity: 0.92, edge: 0xd0d0d0 },
  study: { color: 0xf0f6ff, opacity: 0.94, edge: 0xb8d0f0 },
  hall: { color: 0xf8f8f8, opacity: 0.88, edge: 0xe0e0e0 },
  exit: { color: 0xf0fff4, opacity: 0.93, edge: 0x90e0a8 },
  evac: { color: 0xf0fff4, opacity: 0.93, edge: 0x90e0a8 },
  service: { color: 0xfffbf0, opacity: 0.93, edge: 0xe8d090 },
} as const satisfies Record<
  LibraryRoomType,
  { color: number; opacity: number; edge: number }
>;

/**
 * Parchment-shell albedo — warm paper / plaster volumes that read on a cream
 * dashboard (MeshStandardMaterial). Keeps type accents in edges + subtle emissive.
 */
export const JOHN_ABBOTT_3D_MATS_DARK = {
  open: { color: 0xe8dfd4, opacity: 0.93, edge: 0x9a8a7a, emissive: 0xc9beb2 },
  study: { color: 0xd6e0ec, opacity: 0.93, edge: 0x6f8499, emissive: 0xb4c2d2 },
  hall: { color: 0xdedad4, opacity: 0.9, edge: 0x8a8780, emissive: 0xc4c0b9 },
  exit: { color: 0xcfe8da, opacity: 0.92, edge: 0x3d9f72, emissive: 0xa3d4bc },
  evac: { color: 0xcae8d6, opacity: 0.92, edge: 0x34b86a, emissive: 0x9ed4b4 },
  service: { color: 0xede2cf, opacity: 0.92, edge: 0xc49a52, emissive: 0xd9cbb0 },
} as const satisfies Record<
  LibraryRoomType,
  { color: number; opacity: number; edge: number; emissive: number }
>;

export const JOHN_ABBOTT_LIBRARY_SUBTITLE = "John Abbott College Library · Sainte-Anne-de-Bellevue";

/** Official college site — used in map legend / attribution. */
export const JOHN_ABBOTT_COLLEGE_URL = "https://johnabbott.qc.ca/";
