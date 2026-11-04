import {
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Palette,
  UserRound,
} from "lucide-react";
import { getAccountInfo, requireUser } from "@/lib/auth";
import { logout, logoutOtherDevices } from "@/app/auth-actions";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { ThemeToggle } from "@/components/theme";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function AccountPage() {
  const user = await requireUser();
  const info = getAccountInfo(user.id);

  return (
    <>
      <PageHeader
        emoji="👤"
        title="บัญชีผู้ใช้"
        subtitle="ข้อมูลบัญชี รหัสผ่าน และการเข้าสู่ระบบ"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="โปรไฟล์" icon={<UserRound className="size-5" />}>
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-2xl font-bold text-white uppercase dark:text-[#06281f]">
              {user.username.slice(0, 1)}
            </span>
            <div>
              <p className="text-lg font-semibold">{user.username}</p>
              <p className="text-sm text-muted">
                📅 สมัครเมื่อ {fmtDate(info.createdAt.slice(0, 10))}
              </p>
            </div>
          </div>
          <form action={logout} className="mt-6">
            <button
              type="submit"
              className="btn-ghost w-full text-neg hover:bg-neg-soft"
            >
              <LogOut className="size-4" /> ออกจากระบบ
            </button>
          </form>
        </Card>

        <Card
          title="เปลี่ยนรหัสผ่าน"
          icon={<KeyRound className="size-5" />}
          className="lg:col-span-2"
        >
          <PasswordForm username={user.username} />
        </Card>

        <Card title="ธีม" icon={<Palette className="size-5" />}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">☀️ สว่าง · 🌙 มืด · 💻 ตามระบบ</p>
            <ThemeToggle />
          </div>
        </Card>

        <Card
          title="อุปกรณ์ที่เข้าสู่ระบบ"
          icon={<MonitorSmartphone className="size-5" />}
          className="lg:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              🔑 กำลังเข้าสู่ระบบอยู่{" "}
              <span className="font-semibold">{info.sessions}</span> อุปกรณ์
              (รวมเครื่องนี้)
            </p>
            <form action={logoutOtherDevices}>
              <button
                type="submit"
                className="btn-ghost"
                disabled={info.sessions <= 1}
              >
                ออกจากระบบอุปกรณ์อื่นทั้งหมด
              </button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
