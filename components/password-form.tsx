"use client";

import { useActionState } from "react";
import { changePassword, type AuthState } from "@/app/auth-actions";

export function PasswordForm({ username }: { username: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    changePassword,
    {},
  );
  return (
    <form action={formAction} className="grid gap-4">
      {/* Lets password managers attach the new password to the right account. */}
      <input
        type="text"
        name="username"
        value={username}
        autoComplete="username"
        className="hidden"
        readOnly
      />
      {[
        {
          name: "current",
          label: "รหัสผ่านปัจจุบัน",
          auto: "current-password",
        },
        {
          name: "password",
          label: "รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)",
          auto: "new-password",
        },
        { name: "confirm", label: "ยืนยันรหัสผ่านใหม่", auto: "new-password" },
      ].map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-muted">{f.label}</span>
          <input
            name={f.name}
            type="password"
            autoComplete={f.auto}
            minLength={f.name === "current" ? undefined : 8}
            className="input"
            required
          />
        </label>
      ))}
      {state.error ? (
        <p className="rounded-xl bg-neg-soft px-3 py-2 text-sm text-neg">
          ⚠️ {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-xl bg-pos-soft px-3 py-2 text-sm text-pos">
          {state.success}
        </p>
      ) : null}
      <p className="rounded-xl bg-subtle px-3 py-2 text-sm text-muted">
        💡 เปลี่ยนแล้ว อุปกรณ์อื่นจะถูกออกจากระบบ
        ต้องเข้าสู่ระบบใหม่ด้วยรหัสใหม่
      </p>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
        </button>
      </div>
    </form>
  );
}
