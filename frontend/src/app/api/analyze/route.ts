import { NextResponse } from "next/server";

/**
 * POST /api/analyze
 *
 * Proxies a frame analysis request to the Python backend.
 * Body: { frame_url: string }
 * Returns the FrameAnalysis JSON from the backend.
 */
export async function POST(req: Request) {
  const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!backendUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_BASE_URL not configured" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const frameUrl: string | undefined = body?.frame_url;

  if (!frameUrl) {
    return NextResponse.json(
      { error: "frame_url is required" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${backendUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_url: frameUrl }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Backend ${res.status}: ${text}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backend unreachable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
