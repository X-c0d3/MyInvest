"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "@/app/auth-actions";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";

const FEATURES = [
  ["📈", "ซื้อ-ขาย หุ้นไทย ETF หุ้นต่างประเทศ และ Crypto"],
  ["🎁", "ปันผล คำนวณภาษีและยอดสุทธิให้อัตโนมัติ"],
  ["💱", "หลายสกุลเงิน แปลงเป็นบาทให้ทั้งพอร์ต"],
  ["🎯", "สรุปผลตอบแทนรายปี และติดตามเป้าหมาย"],
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(isLogin ? login : register, {});

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-cyan-300/20 blur-3xl" />
        <p className="relative text-lg font-bold">💹 MyInvest</p>
        <div className="relative">
          <h2 className="text-4xl leading-tight font-bold">
            เลิกเขียนสูตร
            <br />
            ใน Spreadsheet ได้แล้ว ✨
          </h2>
          <ul className="mt-8 space-y-4 text-white/90">
            {FEATURES.map(([emoji, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-xl backdrop-blur">{emoji}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">บันทึกครั้งเดียว ระบบคำนวณให้ทุกอย่าง</p>
      </div>

      <div className="relative flex items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
      <form action={formAction} className="w-full max-w-sm space-y-5">
        <div className="space-y-6">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold">{isLogin ? "ยินดีต้อนรับกลับ 👋" : "เริ่มต้นใช้งาน 🚀"}</h1>
            <p className="mt-1 text-sm text-muted">{isLogin ? "เข้าสู่ระบบเพื่อดูพอร์ตของคุณ" : "สร้างบัญชีใหม่ ใช้เวลาไม่ถึงนาที"}</p>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">ชื่อผู้ใช้</span>
          <input name="username" defaultValue={state.username} className="input" autoComplete="username" required autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">รหัสผ่าน</span>
          <input
            name="password"
            type="password"
            className="input"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={isLogin ? undefined : 8}
            required
          />
        </label>
        {!isLogin ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">ยืนยันรหัสผ่าน</span>
            <input name="confirm" type="password" className="input" autoComplete="new-password" required />
          </label>
        ) : null}
        {state.error ? <p className="rounded-lg bg-neg-soft px-3 py-2 text-sm text-neg">⚠️ {state.error}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">
          {pending ? "กรุณารอสักครู่…" : isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
        <p className="text-center text-sm text-muted">
          {isLogin ? "ยังไม่มีบัญชี? " : "มีบัญชีแล้ว? "}
          <Link href={isLogin ? "/register" : "/login"} className="text-accent hover:underline">
            {isLogin ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </Link>
        </p>
      </form>
      </div>
    </div>
  );
}
