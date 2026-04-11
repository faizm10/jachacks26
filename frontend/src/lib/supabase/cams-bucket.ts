import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileObject } from "@supabase/storage-js";

/** Supabase Storage bucket for camera media (`cam`, `cams`, etc.) */
export function getCamsBucketName(): string {
  return process.env.NEXT_PUBLIC_CAMS_BUCKET?.trim() || "cam";
}

const MEDIA_IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const MEDIA_VIDEO = /\.(mp4|webm|mov)$/i;

export type CamsMediaKind = "image" | "video";

export interface CamsLatestObject {
  /** Path inside the bucket, e.g. `lobby/frame.jpg` or `clips/file.mp4` */
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

function fileTime(f: FileObject): number {
  return new Date(f.updated_at ?? f.created_at ?? 0).getTime();
}

/**
 * List one directory, then one level of subfolders (Supabase list() is not recursive).
 */
async function collectMediaCandidates(
  client: SupabaseClient,
  basePrefix: string,
): Promise<{ path: string; file: FileObject; kind: CamsMediaKind }[]> {
  const out: { path: string; file: FileObject; kind: CamsMediaKind }[] = [];

  const bucket = getCamsBucketName();

  // Pass undefined (not "") when listing root — some Supabase client versions treat "" as a
  // virtual empty-named subfolder rather than the bucket root.
  const listPath = basePrefix || undefined;

  const { data: top, error: topErr } = await client.storage.from(bucket).list(listPath, {
    limit: 500,
    offset: 0,
    sortBy: { column: "updated_at", order: "desc" },
  });

  console.log("[cams-bucket] list", bucket, listPath ?? "(root)", "→", top?.length ?? 0, "items", topErr ?? "");

  if (topErr) {
    throw new Error(topErr.message);
  }

  for (const item of top ?? []) {
    console.log("[cams-bucket] item:", item.name, "metadata:", item.metadata);
    if (!item.name || item.name.endsWith("/")) continue;

    const kindTop = mediaKind(item.name);
    if (kindTop) {
      out.push({ path: objectKey(basePrefix, item.name), file: item, kind: kindTop });
      continue;
    }

    const subPrefix = objectKey(basePrefix, item.name);
    const { data: inner, error: innerErr } = await client.storage.from(bucket).list(subPrefix, {
      limit: 500,
      offset: 0,
      sortBy: { column: "updated_at", order: "desc" },
    });

    if (innerErr) {
      continue;
    }

    for (const f of inner ?? []) {
      if (!f.name || f.name.endsWith("/")) continue;
      const k = mediaKind(f.name);
      if (k) {
        out.push({ path: objectKey(subPrefix, f.name), file: f, kind: k });
      }
    }
  }

  return out;
}

/**
 * Lists all media objects in the camera bucket (root + one subfolder level under optional prefix),
 * sorted newest first.
 */
export async function fetchAllCamsObjects(
  client: SupabaseClient,
  options?: { prefix?: string },
): Promise<CamsLatestObject[]> {
  const bucket = getCamsBucketName();
  let prefix = normalizePrefix(options?.prefix ?? process.env.NEXT_PUBLIC_CAMS_PREFIX);
  if (prefix.length > 0 && prefix.toLowerCase() === bucket.toLowerCase()) {
    console.warn(
      `[Room Intelligence] Ignoring NEXT_PUBLIC_CAMS_PREFIX="${prefix}" — it matches the bucket id "${bucket}". Prefix must be a subfolder inside the bucket (or leave unset for root).`,
    );
    prefix = "";
  }

  const candidates = await collectMediaCandidates(client, prefix);
  if (candidates.length === 0) return [];

  candidates.sort((a, b) => fileTime(b.file) - fileTime(a.file));

  const useSigned = process.env.NEXT_PUBLIC_CAMS_USE_SIGNED_URLS === "true";

  const results: CamsLatestObject[] = [];
  for (const { path, file, kind } of candidates) {
    if (useSigned) {
      const { data: signed, error: signErr } = await client.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 30);
      if (signErr || !signed?.signedUrl) continue;
      results.push({ path, url: signed.signedUrl, kind, updatedAt: file.updated_at ?? file.created_at ?? null });
    } else {
      const { data: pub } = client.storage.from(bucket).getPublicUrl(path);
      results.push({ path, url: pub.publicUrl, kind, updatedAt: file.updated_at ?? file.created_at ?? null });
    }
  }

  return results;
}

/**
 * Lists objects in the camera bucket (root + one subfolder level under optional prefix)
 * and returns the newest media file.
 */
export async function fetchLatestCamsObject(
  client: SupabaseClient,
  options?: { prefix?: string },
): Promise<CamsLatestObject | null> {
  const bucket = getCamsBucketName();
  let prefix = normalizePrefix(options?.prefix ?? process.env.NEXT_PUBLIC_CAMS_PREFIX);
  /* Common mistake: prefix is a folder *inside* the bucket, not the bucket id. Listing prefix === bucket yields empty when files live at root. */
  if (prefix.length > 0 && prefix.toLowerCase() === bucket.toLowerCase()) {
    console.warn(
      `[Room Intelligence] Ignoring NEXT_PUBLIC_CAMS_PREFIX="${prefix}" — it matches the bucket id "${bucket}". Prefix must be a subfolder inside the bucket (or leave unset for root).`,
    );
    prefix = "";
  }

  const candidates = await collectMediaCandidates(client, prefix);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => fileTime(b.file) - fileTime(a.file));
  const { path, file, kind } = candidates[0]!;

  const useSigned = process.env.NEXT_PUBLIC_CAMS_USE_SIGNED_URLS === "true";

  if (useSigned) {
    const { data: signed, error: signErr } = await client.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 30);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message ?? "Could not create signed URL for camera object");
    }
    return {
      path,
      url: signed.signedUrl,
      kind,
      updatedAt: file.updated_at ?? file.created_at ?? null,
    };
  }

  const { data: pub } = client.storage.from(bucket).getPublicUrl(path);
  return {
    path,
    url: pub.publicUrl,
    kind,
    updatedAt: file.updated_at ?? file.created_at ?? null,
  };
}
