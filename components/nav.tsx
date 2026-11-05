"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Briefcase,
  FolderCog,
  Gift,
  LayoutDashboard,
  UserRound,
  Wallet,
} from "lucide-react";

/** `short` is the label in the phone tab bar; `bar` marks the pages that get a tab there. */
const LINKS = [
  {
    href: "/",
    label: "ภาพรวม",
    short: "ภาพรวม",
    Icon: LayoutDashboard,
    bar: true,
  },
  {
    href: "/holdings",
    label: "หลักทรัพย์ที่ถือ",
    short: "หุ้นที่ถือ",
    Icon: Briefcase,
    bar: true,
  },
  {
    href: "/trades",
    label: "ซื้อ-ขาย",
    short: "ซื้อ-ขาย",
    Icon: ArrowLeftRight,
    bar: true,
  },
  { href: "/dividends", label: "ปันผล", short: "ปันผล", Icon: Gift, bar: true },
  {
    href: "/cashflows",
    label: "ฝาก-ถอน",
    short: "ฝาก-ถอน",
    Icon: Wallet,
    bar: true,
  },
  {
    href: "/portfolios",
    label: "พอร์ต & ค่าเงิน",
    short: "พอร์ต",
    Icon: FolderCog,
    bar: false,
  },
  {
    href: "/account",
    label: "บัญชีผู้ใช้",
    short: "บัญชี",
    Icon: UserRound,
    bar: false,
  },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Sidebar navigation (tablet and up). */
export function Nav() {
  const isActive = useIsActive();
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition ${
            isActive(href)
              ? "bg-accent-soft font-semibold text-accent"
              : "text-muted hover:bg-subtle hover:text-foreground"
          }`}
        >
          <Icon className="size-[18px] shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone tab bar fixed to the bottom of the screen; the other pages sit in the top bar. */
export function TabBar() {
  const isActive = useIsActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {LINKS.filter((l) => l.bar).map(({ href, short, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] ${
                active ? "font-semibold text-accent" : "text-muted"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-accent-soft" : ""
                }`}
              >
                <Icon className="size-5" />
              </span>
              {short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Icon links for the pages that are not in the tab bar (phone top bar). */
export function TopLinks() {
  const isActive = useIsActive();
  return (
    <div className="flex items-center gap-1">
      {LINKS.filter((l) => !l.bar).map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          title={label}
          className={`icon-btn size-9 ${isActive(href) ? "bg-accent-soft !text-accent" : ""}`}
        >
          <Icon className="size-5" />
          <span className="sr-only">{label}</span>
        </Link>
      ))}
    </div>
  );
}
