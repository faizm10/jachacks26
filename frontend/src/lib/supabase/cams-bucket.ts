import type { SupabaseClient } from "@supabase/supabase-js";

export const CAMS_BUCKET = "cams" as const;

const MEDIA_IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const MEDIA_VIDEO = /\.(mp4|webm|mov)$/i;

export type CamsMediaKind = "image" | "video";

export interface CamsLatestObject {
  /** Path inside the bucket, e.g. `lobby/frame.jpg` or `frame.jpg` */
  path: string;
  url: string;
  kind: CamsMediaKind;
  updatedAt: string | null;
}

function normalizePrefix(prefix: string | undefined): string {
  if (!prefix?.trim()) return "";
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}

function objectKey(prefix: string, name: string): string {
  const p = normalizePrefix(prefix);
  return p ? `${p}/${name}` : name;
}

function mediaKind(name: string): CamsMediaKind | null {
  if (MEDIA_IMAGE.test(name)) return "image";
  if (MEDIA_VIDEO.test(name)) return "video";
  return null;
}

/**
 * Lists objects in the `cams` bucket (single folder level) and returns the newest media file.
 * Upload frames to the bucket root or under `NEXT_PUBLIC_CAMS_PREFIX`.
 */
export async function fetchLatestCamsObject(
  client: SupabaseClient,
  options?: { prefix?: string },
): Promise<CamsLatestObject | null> {
  const prefix = normalizePrefix(options?.prefix ?? process.env.NEXT_PUBLIC_CAMS_PREFIX);

  const { data: files, error } = await client.storage.from(CAMS_BUCKET).list(prefix, {
    limit: 200,
    offset: 0,
    sortBy: { column: "updated_at", order: "desc" },
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (files ?? []).filter((f) => {
    if (!f.name || f.name.endsWith("/")) return false;
    if (f.id == null) return false;
    return mediaKind(f.name) != null;
  });

  rows.sort((a, b) => {
    const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return tb - ta;
  });

  const file = rows[0];
  if (!file) return null;

  const path = objectKey(prefix, file.name);
  const kind = mediaKind(file.name)!;
  const useSigned = process.env.NEXT_PUBLIC_CAMS_USE_SIGNED_URLS === "true";

  if (useSigned) {
    const { data: signed, error: signErr } = await client.storage
      .from(CAMS_BUCKET)
      .createSignedUrl(path, 60 * 30);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message ?? "Could not create signed URL for cams object");
    }
    return {
      path,
      url: signed.signedUrl,
      kind,
      updatedAt: file.updated_at ?? file.created_at ?? null,
    };
  }

  const { data: pub } = client.storage.from(CAMS_BUCKET).getPublicUrl(path);
  return {
    path,
    url: pub.publicUrl,
    kind,
    updatedAt: file.updated_at ?? file.created_at ?? null,
  };
}
