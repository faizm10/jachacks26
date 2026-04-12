"use client";

import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const links = [
  { href: "/", label: "Overview" },
  { href: "/#camera-feed", label: "Motion clips" },
  { href: "/spatial-map", label: "Spatial map" },
];

function linkIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  if (href === "/#camera-feed") return pathname.startsWith("/camera/");
  if (href === "/spatial-map") return pathname === "/spatial-map";
  return false;
}

export function Sidebar({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
        onClick={onNavigate}
      />

      {/* Mobile: slide-down drawer */}
      <aside
        className={cn(
          "fixed left-0 right-0 top-0 z-50 flex flex-col transition-transform duration-300 ease-out lg:hidden",
          "border-b border-white/6 bg-[rgba(8,10,14,0.95)] backdrop-blur-2xl",
          open ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <LogoMark />
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Foco</p>
            <p className="text-[11px] font-medium text-white/40">Control surface</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 pb-4">
          {links.map((link) => {
            const active = linkIsActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={cn(
                  "relative rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "text-white" : "text-white/45 hover:bg-white/5 hover:text-white/80",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill-mobile"
                    className="absolute inset-0 rounded-xl border border-white/8 bg-white/6"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Desktop: floating top bar, centered horizontally */}
      <div className="pointer-events-none fixed left-0 right-0 top-5 z-50 hidden justify-center lg:flex">
        <nav className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/8 bg-[rgba(8,10,14,0.75)] px-2 py-1.5 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          {/* Logo */}
          <div className="flex items-center gap-2 px-2 pr-3">
            <LogoMark className="h-6 w-6" />
            <span className="text-[13px] font-semibold tracking-tight text-white/70">Foco</span>
          </div>

          <div className="h-5 w-px bg-white/8" />

          {/* Nav links */}
          {links.map((link) => {
            const active = linkIsActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={cn(
                  "relative rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap",
                  active
                    ? "text-white"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border border-white/10 bg-white/7"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
