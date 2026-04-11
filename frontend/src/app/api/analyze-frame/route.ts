import { NextResponse } from "next/server";

/**
 * POST /api/analyze-frame
 *
 * Accepts a base64-encoded video frame and proxies it to the Python backend
 * for live person tracking.
 * Body: { image_base64: string, mime_type?: string }
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
  if (!body?.image_base64) {
    return NextResponse.json(
      { error: "image_base64 is required" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${backendUrl}/analyze-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: body.image_base64,
        mime_type: body.mime_type ?? "image/jpeg",
      }),
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
