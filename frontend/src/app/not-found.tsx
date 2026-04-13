import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground">
        This page does not exist.
      </h1>
      <Link
        href="/"
        className="mt-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Back home
      </Link>
    </div>
  );
}
