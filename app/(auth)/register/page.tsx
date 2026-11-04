import Link from "next/link";
import { connection } from "next/server";
import { registrationOpen } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

// Whether sign-up is open depends on the database, so this renders per request.
export const instant = false;

export default async function RegisterPage() {
  await connection();
  if (registrationOpen()) return <AuthForm mode="register" />;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="text-4xl">🔒</p>
        <h1 className="text-lg font-semibold">ปิดรับสมัครสมาชิก</h1>
        <p className="text-sm text-muted">
          ระบบนี้ใช้งานส่วนตัว ถ้าต้องการบัญชีใหม่ ให้ผู้ดูแลตั้งค่า
          ALLOW_REGISTRATION=true ชั่วคราว
        </p>
        <Link href="/login" className="btn-primary w-full">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
