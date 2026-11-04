"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Briefcase, FolderCog, Gift, LayoutDashboard, UserRound, Wallet } from "lucide-react";

const LINKS = [
  { href: "/", label: "ภาพรวม", Icon: LayoutDashboard },
  { href: "/holdings", label: "หลักทรัพย์ที่ถือ", Icon: Briefcase },
  { href: "/trades", label: "ซื้อ-ขาย", Icon: ArrowLeftRight },
  { href: "/dividends", label: "ปันผล", Icon: Gift },
  { href: "/cashflows", label: "ฝาก-ถอน", Icon: Wallet },
  { href: "/portfolios", label: "พอร์ต & ค่าเงิน", Icon: FolderCog },
  { href: "/account", label: "บัญชีผู้ใช้", Icon: UserRound },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:flex-col md:overflow-visible">
      {LINKS.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition ${
              active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-subtle hover:text-foreground"
            }`}
          >
            <Icon className="size-[18px] shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
