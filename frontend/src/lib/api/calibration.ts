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
  const b = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (!b) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set — add it in frontend/.env.local");
  }
  return b;
}

async function parseErrorDetail(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (j?.detail !== undefined) {
      return Array.isArray(j.detail)
        ? j.detail.map((x) => String(x)).join(", ")
        : String(j.detail);
    }
  } catch {
    /* ignore */
  }
  return text || `HTTP ${res.status}`;
}

export async function listCalibrations(): Promise<CorridorCalibration[]> {
  const res = await fetch(`${base()}/calibrations`);
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  const json = (await res.json()) as { calibrations: CorridorCalibration[] };
  return json.calibrations;
}

export async function saveCalibration(cal: CorridorCalibration): Promise<void> {
  const id = cal.camera_id.trim().toLowerCase();
  const payload = { ...cal, camera_id: id };
  const res = await fetch(`${base()}/calibrations/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseErrorDetail(res));
  }
}

export async function deleteCalibration(cameraId: string): Promise<void> {
  const id = cameraId.trim().toLowerCase();
  const res = await fetch(`${base()}/calibrations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
