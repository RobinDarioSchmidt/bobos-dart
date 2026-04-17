"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Hub",
    shortLabel: "Start",
  },
  {
    href: "/live",
    label: "Live",
    shortLabel: "Live",
  },
  {
    href: "/profile",
    label: "Profil",
    shortLabel: "Profil",
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function MobileAppNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-4">
      <nav className="pointer-events-auto mx-auto max-w-md rounded-[1.75rem] border border-white/10 bg-black/75 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-2">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[1.2rem] px-3 py-2.5 text-center transition ${
                  active
                    ? "bg-emerald-400 text-black"
                    : "border border-white/10 bg-white/5 text-stone-200 hover:bg-white/10"
                }`}
              >
                <span className="block text-[10px] uppercase tracking-[0.2em] opacity-70">{item.shortLabel}</span>
                <span className="mt-1 block text-sm font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
