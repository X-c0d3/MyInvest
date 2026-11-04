"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  registrationOpen,
  requireUser,
  verifyPassword,
} from "@/lib/auth";

export type AuthState = { error?: string; username?: string; success?: string };

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = getDb()
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string } | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", username };
  }
  await createSession(user.id);
  redirect("/");
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!registrationOpen())
    return { error: "ปิดรับสมัครสมาชิกแล้ว ติดต่อผู้ดูแลระบบ", username };
  if (!USERNAME_RE.test(username))
    return { error: "ชื่อผู้ใช้ 3–32 ตัว ใช้ได้เฉพาะ a-z 0-9 _ . -", username };
  if (password.length < 8)
    return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร", username };
  if (password !== confirm)
    return { error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน", username };
  if (getDb().prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว", username };
  }

  const userId = getDb().transaction(() => {
    const { lastInsertRowid } = getDb()
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hashPassword(password));
    const id = Number(lastInsertRowid);
    // Start with the two portfolios most people track, matching the old spreadsheet.
    const addPort = getDb().prepare(
      "INSERT INTO portfolios (user_id, name, kind) VALUES (?, ?, ?)",
    );
    addPort.run(id, "พอร์ตหุ้น", "stock");
    addPort.run(id, "พอร์ต Crypto", "crypto");
    return id;
  })();

  await createSession(userId);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash))
    return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  if (next.length < 8)
    return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" };
  if (next !== confirm) return { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" };
  if (next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" };

  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(next), user.id);
  // A changed password should lock out anyone else who had it.
  await destroyOtherSessions(user.id);
  revalidatePath("/account");
  return {
    success: "เปลี่ยนรหัสผ่านเรียบร้อย และออกจากระบบอุปกรณ์อื่นแล้ว 🔐",
  };
}

export async function logoutOtherDevices() {
  const user = await requireUser();
  await destroyOtherSessions(user.id);
  revalidatePath("/account");
}
