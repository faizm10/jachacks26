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
        "rounded-2xl border border-border/80 bg-card/75 text-foreground shadow-[0_12px_40px_rgba(62,48,40,0.08)]",
        "backdrop-blur-2xl backdrop-saturate-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
