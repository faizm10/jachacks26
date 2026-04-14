import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl border border-border/90 bg-card shadow-inner",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-5 w-5 text-primary" fill="none">
        <path
          d="M6 22V10l6-4 6 4v12l-6 4-6-4Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          d="M18 14v8l4-2.3V11.7L18 14Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
