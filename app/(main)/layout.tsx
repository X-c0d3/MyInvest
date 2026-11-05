import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { Nav, TabBar, TopLinks } from "@/components/nav";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[2400px] flex-col md:flex-row">
      {/* Phones: compact top bar + bottom tab bar. */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" aria-label="ภาพรวม">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <TopLinks />
        </div>
      </header>
      <TabBar />

      {/* Tablet and up: sidebar. */}
      <aside className="sticky top-0 z-10 hidden h-screen w-56 shrink-0 flex-col gap-4 border-r border-line bg-surface/80 p-4 backdrop-blur md:flex">
        <Logo />
        <Nav />
        <div className="mt-auto flex flex-col gap-3">
          <ThemeToggle />
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-6">{children}</main>
    </div>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
      <Link
        href="/account"
        className="flex min-w-0 flex-1 items-center gap-2.5"
        title="บัญชีผู้ใช้"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 font-semibold text-white uppercase dark:text-[#06281f]">
          {user.username.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {user.username}
          </span>
          <span className="block text-xs text-muted">นักลงทุน 🚀</span>
        </span>
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className="icon-btn hover:!text-neg"
          title="ออกจากระบบ"
        >
          <LogOut className="size-4" />
          <span className="sr-only">ออกจากระบบ</span>
        </button>
      </form>
    </div>
  );
}
