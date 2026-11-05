import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { getAccountInfo, requireUser } from "@/lib/auth";
import { logout, logoutOtherDevices } from "@/app/auth-actions";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { FormModal } from "@/components/form-modal";
import { PasswordForm } from "@/components/password-form";
import { ThemeToggle } from "@/components/theme";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

/** One settings row: emoji, label and hint on the left, a control on the right. */
function Row({
  emoji,
  label,
  hint,
  children,
}: {
  emoji: string;
  label: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg"
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted">
        {title}
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const user = await requireUser();
  const sp = await searchParams;
  const info = getAccountInfo(user.id);
  const others = info.sessions - 1;

  return (
    <>
      <PageHeader
        emoji="👤"
        title="บัญชีผู้ใช้"
        subtitle="ข้อมูลบัญชี รหัสผ่าน และการเข้าสู่ระบบ"
      />

      <div className="grid max-w-3xl gap-5">
        {/* Profile */}
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-gradient-to-br from-accent-soft to-surface p-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-2xl font-bold text-white uppercase dark:text-[#06281f]">
            {user.username.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{user.username}</p>
            <p className="text-sm text-muted">
              📅 สมัครเมื่อ {fmtDate(info.createdAt.slice(0, 10))}
            </p>
          </div>
        </div>

        <Section title="ความปลอดภัย">
          <Row emoji="🔑" label="รหัสผ่าน" hint="แนะนำให้ยาวอย่างน้อย 8 ตัว">
            <Link
              href="/account?password=1"
              scroll={false}
              className="btn-ghost"
            >
              เปลี่ยนรหัสผ่าน <ChevronRight className="size-4" />
            </Link>
          </Row>
          <Row
            emoji="📱"
            label="อุปกรณ์ที่เข้าสู่ระบบ"
            hint={
              others > 0
                ? `เครื่องนี้ และอีก ${others} อุปกรณ์`
                : "เข้าสู่ระบบอยู่เครื่องนี้เครื่องเดียว"
            }
          >
            {others > 0 ? (
              <form action={logoutOtherDevices}>
                <button type="submit" className="btn-ghost">
                  ออกจากอุปกรณ์อื่น
                </button>
              </form>
            ) : null}
          </Row>
        </Section>

        <Section title="การแสดงผล">
          <Row emoji="🎨" label="ธีม" hint="☀️ สว่าง · 🌙 มืด · 💻 ตามระบบ">
            <ThemeToggle />
          </Row>
        </Section>

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3.5 font-medium text-neg transition-colors hover:bg-neg-soft"
          >
            <LogOut className="size-4" /> ออกจากระบบ
          </button>
        </form>
      </div>

      <FormModal
        open={sp.password === "1"}
        emoji="🔑"
        title="เปลี่ยนรหัสผ่าน"
        closeHref="/account"
      >
        <PasswordForm username={user.username} />
      </FormModal>
    </>
  );
}
