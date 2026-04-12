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

      {/* Floating sidebar — vertically centered on desktop */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-[240px] flex-col transition-transform duration-300 ease-out lg:hidden",
          "border-r border-white/[0.06] bg-[rgba(8,10,14,0.92)] backdrop-blur-2xl",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <MobileSidebarContent pathname={pathname} onNavigate={onNavigate} />
      </aside>

      {/* Desktop: floating pill centered vertically */}
      <div className="pointer-events-none fixed left-4 top-0 z-50 hidden h-full items-center lg:flex">
        <nav className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-[rgba(8,10,14,0.75)] p-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          {/* Logo */}
          <div className="flex items-center justify-center px-1 pb-2 pt-1">
            <LogoMark className="h-7 w-7" />
          </div>

          <div className="mx-auto h-px w-6 bg-white/[0.08]" />

          {/* Nav links */}
          {links.map((link) => {
            const active = linkIsActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors whitespace-nowrap",
                  active
                    ? "text-white"
                    : "text-white/40 hover:bg-white/[0.05] hover:text-white/70",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border border-white/[0.1] bg-white/[0.07]"
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

function MobileSidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <LogoMark />
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">Room Intelligence</p>
          <p className="text-[11px] font-medium text-white/40">Control surface</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 pb-6">
        {links.map((link) => {
          const active = linkIsActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "relative rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-white" : "text-white/45 hover:bg-white/[0.05] hover:text-white/80",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill-mobile"
                  className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.06]"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative z-10">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
