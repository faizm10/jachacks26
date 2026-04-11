import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-sm font-medium text-white/45">404</p>
      <h1 className="text-balance text-xl font-semibold tracking-tight text-white">
        This page does not exist.
      </h1>
      <Link
        href="/"
        className="mt-2 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/15"
      >
        Back home
      </Link>
    </div>
  );
}
