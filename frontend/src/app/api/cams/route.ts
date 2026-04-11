import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MEDIA_VIDEO = /\.(mp4|webm|mov)$/i;
const MEDIA_IMAGE = /\.(jpe?g|png|webp|gif)$/i;

function mediaKind(name: string): "video" | "image" | null {
  if (MEDIA_VIDEO.test(name)) return "video";
  if (MEDIA_IMAGE.test(name)) return "image";
  return null;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Service role bypasses RLS — never expose this key to the browser
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const bucket = process.env.NEXT_PUBLIC_CAMS_BUCKET?.trim() || "cam";

  const { data, error } = await supabase.storage.from(bucket).list(undefined, {
    limit: 500,
    offset: 0,
    sortBy: { column: "updated_at", order: "desc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const objects = (data ?? [])
    .filter((f) => f.name && !f.name.endsWith("/") && mediaKind(f.name) !== null)
    .map((f) => {
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(f.name);
      return {
        path: f.name,
        url: pub.publicUrl,
        kind: mediaKind(f.name),
        updatedAt: f.updated_at ?? f.created_at ?? null,
      };
    });

  return NextResponse.json({ objects });
}
