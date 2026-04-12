/**
 * Persistent IndexedDB cache for video analysis results.
 * Survives page navigation and browser refresh.
 */

import type { FrameAnalysis, DetectedPerson } from "@/lib/types/room";

const DB_NAME = "room-intel-analysis";
const DB_VERSION = 1;
const STORE_LIVE = "live-analysis";
const STORE_GEMINI = "gemini-analysis";
/** Cache entries older than this are ignored. */
const MAX_AGE_MS = 1000 * 60 * 60 * 4; // 4 hours

interface GeminiCacheEntry {
  persons: DetectedPerson[];
  scene: string;
  ts: number;
}

interface LiveCacheEntry {
  analysis: FrameAnalysis;
  ts: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LIVE)) {
        db.createObjectStore(STORE_LIVE);
      }
      if (!db.objectStoreNames.contains(STORE_GEMINI)) {
        db.createObjectStore(STORE_GEMINI);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromStore<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function putInStore<T>(storeName: string, key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
  } catch {
    // Silently fail — cache is best-effort
  }
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
  } catch {
    // Silently fail
  }
}

// ── Live analysis cache (useLiveAnalysis) ──

export async function getCachedLiveAnalysis(url: string): Promise<FrameAnalysis | null> {
  const entry = await getFromStore<LiveCacheEntry>(STORE_LIVE, url);
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return entry.analysis;
}

export async function setCachedLiveAnalysis(url: string, analysis: FrameAnalysis): Promise<void> {
  await putInStore(STORE_LIVE, url, { analysis, ts: Date.now() });
}

// ── Gemini one-shot cache (ARLabelsOverlay) ──

export async function getCachedGeminiAnalysis(
  url: string,
): Promise<{ persons: DetectedPerson[]; scene: string } | null> {
  const entry = await getFromStore<GeminiCacheEntry>(STORE_GEMINI, url);
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return { persons: entry.persons, scene: entry.scene };
}

export async function setCachedGeminiAnalysis(
  url: string,
  persons: DetectedPerson[],
  scene: string,
): Promise<void> {
  await putInStore(STORE_GEMINI, url, { persons, scene, ts: Date.now() });
}

export async function deleteCachedGeminiAnalysis(url: string): Promise<void> {
  await deleteFromStore(STORE_GEMINI, url);
}
