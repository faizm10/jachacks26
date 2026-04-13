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
          "fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
        onClick={onNavigate}
      />

      {/* Mobile: slide-down drawer */}
      <aside
        className={cn(
          "fixed left-0 right-0 top-0 z-50 flex flex-col transition-transform duration-300 ease-out lg:hidden",
          "border-b border-border/90 bg-popover/95 backdrop-blur-2xl",
          open ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <LogoMark />
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">Foco</p>
            <p className="text-[11px] font-medium text-muted-foreground">Control surface</p>
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
                  active
                    ? "text-foreground"
                    : "text-foreground/70 hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill-mobile"
                    className="absolute inset-0 rounded-xl border border-border/90 bg-muted/80"
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
        <nav className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border/80 bg-card/85 px-2 py-1.5 shadow-lg shadow-stone-900/10 backdrop-blur-2xl">
          {/* Logo */}
          <div className="flex items-center gap-2 px-2 pr-3">
            <LogoMark className="h-6 w-6" />
            <span className="text-[13px] font-semibold tracking-tight text-foreground/85">Foco</span>
          </div>

          <div className="h-5 w-px bg-border/80" />

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
                    ? "text-foreground"
                    : "text-foreground/70 hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border border-border/90 bg-muted/80"
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
