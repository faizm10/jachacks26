"use client";

import { LogoMark } from "@/components/brand/logo-mark";
import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard#camera-feed", label: "Motion clips" },
  { href: "/spatial-map", label: "Spatial map" },
];

function linkIsActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
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
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
        onClick={onNavigate}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-[260px] flex-col border-r border-white/[0.06] bg-[rgba(8,10,14,0.92)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:static lg:z-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <LogoMark />
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">{SITE_NAME}</p>
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
                {active ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl border border-white/[0.08] bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/[0.06] px-5 py-4">
          <p className="text-[11px] leading-relaxed text-white/35">
            Frontend shell only. Connect your Python service via{" "}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-white/55">
              NEXT_PUBLIC_API_BASE_URL
            </code>
            .
          </p>
        </div>
      </aside>
    </>
  );
}
