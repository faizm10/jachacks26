import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function GlassPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
        "backdrop-blur-2xl backdrop-saturate-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
