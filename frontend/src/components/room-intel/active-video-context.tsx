"use client";

import type { CamsLatestObject } from "@/lib/supabase/cams-bucket";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ActiveVideo = Pick<CamsLatestObject, "path" | "url" | "kind"> | null;

type ActiveVideoContextValue = {
  activeVideo: ActiveVideo;
  setActiveVideo: (v: ActiveVideo) => void;
  selectFromTile: (obj: CamsLatestObject) => void;
};

const ActiveVideoContext = createContext<ActiveVideoContextValue | null>(null);

export function ActiveVideoProvider({ children }: { children: ReactNode }) {
  const [activeVideo, setActiveVideo] = useState<ActiveVideo>(null);

  const selectFromTile = useCallback((obj: CamsLatestObject) => {
    setActiveVideo({ path: obj.path, url: obj.url, kind: obj.kind });
  }, []);

  const value = useMemo(
    () => ({
      activeVideo,
      setActiveVideo,
      selectFromTile,
    }),
    [activeVideo, selectFromTile],
  );

  return <ActiveVideoContext.Provider value={value}>{children}</ActiveVideoContext.Provider>;
}

export function useActiveVideo() {
  const ctx = useContext(ActiveVideoContext);
  if (!ctx) {
    throw new Error("useActiveVideo must be used within ActiveVideoProvider");
  }
  return ctx;
}
