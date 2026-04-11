import type { FloorPlanData } from "@/lib/types/room";

function getBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
  return base;
}

export class FloorplanApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FloorplanApiError";
  }
}

export type FloorplanAnalyzeOptions = {
  /**
   * true = warp motion from video ROI → floor corridor ROI (IMG_5530 preset).
   * Omit = server auto-detects from URL when filename contains IMG_5530.
   */
  corridorMap?: boolean;
  /**
   * If set, backend looks up stored calibration by camera_id and uses
   * HOG person detection + homography (more accurate than frame differencing).
   */
  cameraId?: string;
};

/**
 * POST motion-derived spatial map from a public video URL (Python FastAPI).
 */
export async function analyzeFloorplanFromVideo(
  videoUrl: string,
  opts?: FloorplanAnalyzeOptions,
): Promise<FloorPlanData> {
  const base = getBase();
  if (!base) {
    throw new FloorplanApiError("NEXT_PUBLIC_API_BASE_URL is not set", 0);
  }

  const body: { video_url: string; corridor_map?: boolean; camera_id?: string } = {
    video_url: videoUrl,
  };
  if (opts?.corridorMap === true) body.corridor_map = true;
  if (opts?.cameraId) body.camera_id = opts.cameraId;

  const res = await fetch(`${base}/floorplan/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new FloorplanApiError(text || "Invalid JSON from floorplan API", res.status);
  }

  if (!res.ok) {
    let detail = text;
    if (typeof json === "object" && json !== null && "detail" in json) {
      const d = (json as { detail: unknown }).detail;
      detail = Array.isArray(d) ? d.map((x) => String(x)).join(", ") : String(d);
    }
    throw new FloorplanApiError(detail || `HTTP ${res.status}`, res.status);
  }

  return json as FloorPlanData;
}
