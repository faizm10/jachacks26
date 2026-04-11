export interface CorridorCalibration {
  camera_id: string;
  /** 4 [x, y] points in the camera frame as percentages 0–100 */
  camera_pts: [number, number][];
  /** 4 corresponding [x, y] points on the floor plan as percentages 0–100 */
  floor_pts: [number, number][];
  floor_w: number;
  floor_h: number;
  label: string;
}

function base(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
}

export async function listCalibrations(): Promise<CorridorCalibration[]> {
  const res = await fetch(`${base()}/calibrations`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { calibrations: CorridorCalibration[] };
  return json.calibrations;
}

export async function saveCalibration(cal: CorridorCalibration): Promise<void> {
  const res = await fetch(`${base()}/calibrations/${encodeURIComponent(cal.camera_id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cal),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function deleteCalibration(cameraId: string): Promise<void> {
  const res = await fetch(`${base()}/calibrations/${encodeURIComponent(cameraId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
