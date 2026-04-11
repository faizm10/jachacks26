/**
 * HTTP client for the future Python backend.
 * Uses NEXT_PUBLIC_API_BASE_URL; throws if unset when making real requests.
 */
const API_BASE =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? ""
    : "";

export function getApiBaseUrl(): string {
  return API_BASE;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Add it to .env.local for live API calls.",
    );
  }
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}
