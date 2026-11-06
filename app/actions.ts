"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  CASH_SOURCES,
  CURRENCIES,
  deleteRow,
  getPortfolio,
  listKnownSymbols,
  saveCashflow,
  saveFxRate,
  saveDividend,
  savePortfolio,
  savePrice,
  savePosition,
  saveCashBalance,
  saveTrade,
  setGoal,
  type DeletableTable,
} from "@/lib/data";

/** On error, `values` echoes what was submitted so the form can refill itself after React resets it. */
export type FormState = { error?: string; values?: Record<string, string> };

class ValidationError extends Error {}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function num(
  f: FormData,
  k: string,
  label: string,
  { min = 0, allowZero = true } = {},
) {
  const raw = str(f, k).replace(/,/g, "");
  const n = raw === "" && allowZero ? 0 : Number(raw);
  if (!Number.isFinite(n) || n < min || (!allowZero && n === 0)) {
    throw new ValidationError(`กรุณาระบุ${label}ให้ถูกต้อง`);
  }
  return n;
}

function date(f: FormData, k: string, label: string, required = true) {
  const v = str(f, k);
  if (!v && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new ValidationError(`กรุณาระบุ${label}`);
  return v;
}

function oneOf<T extends string>(
  f: FormData,
  k: string,
  values: readonly T[],
): T {
  const v = str(f, k) as T;
  if (!values.includes(v)) throw new ValidationError("ข้อมูลไม่ถูกต้อง");
  return v;
}

function editId(f: FormData) {
  const v = Number(str(f, "id"));
  return Number.isInteger(v) && v > 0 ? v : null;
}

function portfolioField(f: FormData, userId: number) {
  const portfolio = getPortfolio(userId, Number(str(f, "portfolioId")));
  if (!portfolio) throw new ValidationError("กรุณาเลือกพอร์ต");
  return portfolio;
}

/** Wraps a save: re-checks the session, maps validation errors to form state, then returns to the list. */
async function handle(
  f: FormData,
  path: string,
  fn: (userId: number) => Promise<void> | void,
): Promise<FormState> {
  const user = await requireUser();
  try {
    await fn(user.id);
  } catch (e) {
    if (e instanceof ValidationError) {
      const values = Object.fromEntries(
        [...f].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")),
      );
      return { error: e.message, values: values as Record<string, string> };
    }
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(path);
}

export async function savePortfolioAction(_: FormState, f: FormData) {
  return handle(f, "/portfolios", (userId) => {
    const name = str(f, "name");
    if (!name) throw new ValidationError("กรุณาระบุชื่อพอร์ต");
    savePortfolio(userId, editId(f), {
      name,
      kind: oneOf(f, "kind", ["stock", "crypto"]),
      currency: oneOf(f, "currency", CURRENCIES),
      dividendsToCash: oneOf(f, "dividendsTo", ["bank", "cash"]) === "cash",
      note: str(f, "note"),
    });
  });
}

export async function saveCashflowAction(_: FormState, f: FormData) {
  return handle(f, "/cashflows", (userId) => {
    const portfolio = portfolioField(f, userId);
    const amount = num(f, "amount", "จำนวนเงิน", { allowZero: false });
    // Foreign portfolios: the baht actually paid lets FX gains show up in THB returns. Optional.
    const amountThb =
      portfolio.currency === "THB"
        ? amount
        : str(f, "amountThb")
          ? num(f, "amountThb", "ยอดเงินบาท")
          : null;
    saveCashflow(userId, editId(f), {
      portfolioId: portfolio.id,
      type: oneOf(f, "type", ["deposit", "withdraw"]),
      amount,
      amountThb,
      source: oneOf(f, "source", CASH_SOURCES),
      date: date(f, "date", "วันที่")!,
      account: str(f, "account"),
      note: str(f, "note"),
    });
  });
}

export async function saveTradeAction(_: FormState, f: FormData) {
  return handle(f, "/trades", (userId) => {
    const symbol = str(f, "symbol").toUpperCase();
    if (!symbol) throw new ValidationError("กรุณาเลือก Symbol");
    if (!/^[A-Z0-9][A-Z0-9.\-]*$/.test(symbol))
      throw new ValidationError("Symbol ใช้ได้เฉพาะ A-Z, 0-9, จุด และขีด");
    const portfolioId = portfolioField(f, userId).id;
    const side = oneOf(f, "side", ["buy", "sell"]);
    // A new symbol can only enter the system through a buy; a sell must be something already held.
    if (
      side === "sell" &&
      !listKnownSymbols(userId).some(
        (k) => k.portfolioId === portfolioId && k.symbol === symbol,
      )
    )
      throw new ValidationError(
        `ขาย ${symbol} ไม่ได้ เพราะยังไม่มี ${symbol} ในพอร์ตนี้`,
      );
    saveTrade(userId, editId(f), {
      portfolioId,
      symbol,
      assetType: oneOf(f, "assetType", ["stock", "etf", "crypto"]),
      side,
      quantity: num(f, "quantity", "จำนวน", { allowZero: false }),
      price: num(f, "price", "ราคา"),
      fee: num(f, "fee", "ค่าธรรมเนียม"),
      date: date(f, "date", "วันที่")!,
      broker: str(f, "broker"),
      note: str(f, "note"),
    });
  });
}

export async function saveDividendAction(_: FormState, f: FormData) {
  return handle(f, "/dividends", (userId) => {
    const symbol = str(f, "symbol").toUpperCase();
    if (!symbol) throw new ValidationError("กรุณาเลือกหุ้น");
    const portfolioId = portfolioField(f, userId).id;
    // Only symbols already in this portfolio (trades, holdings or past dividends) are allowed.
    const known = listKnownSymbols(userId).some(
      (k) => k.portfolioId === portfolioId && k.symbol === symbol,
    );
    if (!known)
      throw new ValidationError(
        `ไม่พบ ${symbol} ในพอร์ตนี้ ให้เพิ่มหุ้นที่หน้าหลักทรัพย์ที่ถือหรือซื้อ-ขายก่อน`,
      );
    const taxRate = num(f, "taxRate", "อัตราภาษี");
    if (taxRate > 100) throw new ValidationError("อัตราภาษีต้องไม่เกิน 100%");
    saveDividend(userId, editId(f), {
      portfolioId,
      symbol,
      shares: num(f, "shares", "จำนวนหุ้น", { allowZero: false }),
      dps: num(f, "dps", "ปันผลต่อหุ้น"),
      taxRate,
      xdDate: date(f, "xdDate", "วัน XD", false),
      paidDate: date(f, "paidDate", "วันจ่ายปันผล")!,
      note: str(f, "note"),
    });
  });
}

export async function saveFxRateAction(_: FormState, f: FormData) {
  return handle(f, "/portfolios", (userId) => {
    const currency = oneOf(f, "currency", CURRENCIES);
    if (currency === "THB")
      throw new ValidationError("ไม่ต้องตั้งอัตราของเงินบาท");
    saveFxRate(
      userId,
      currency,
      num(f, "rate", "อัตราแลกเปลี่ยน", { allowZero: false }),
    );
  });
}

export async function saveCashBalanceAction(_: FormState, f: FormData) {
  return handle(f, "/holdings", (userId) => {
    const portfolio = portfolioField(f, userId);
    // Empty clears the value, so the portfolio shows as "not entered" again.
    const amount =
      str(f, "cash") === "" ? null : num(f, "cash", "เงินสดในโบรก");
    saveCashBalance(userId, portfolio.id, amount);
  });
}

/** Sets a holding to what the broker shows (quantity + average cost), optionally with the latest price. */
export async function savePositionAction(_: FormState, f: FormData) {
  return handle(f, "/holdings", (userId) => {
    const portfolio = portfolioField(f, userId);
    const symbol = str(f, "symbol").toUpperCase();
    if (!symbol) throw new ValidationError("กรุณาระบุชื่อหุ้น / เหรียญ");
    savePosition(userId, {
      portfolioId: portfolio.id,
      symbol,
      assetType: oneOf(f, "assetType", ["stock", "etf", "crypto"]),
      quantity: num(f, "quantity", "จำนวน"),
      avgCost: num(f, "avgCost", "ต้นทุนเฉลี่ย"),
      asOf: new Date().toISOString().slice(0, 10),
    });
    if (str(f, "price") !== "")
      savePrice(userId, symbol, num(f, "price", "ราคาล่าสุด"));
  });
}

export async function saveGoalAction(_: FormState, f: FormData) {
  return handle(f, "/", (userId) =>
    setGoal(userId, num(f, "goal", "เป้าหมาย")),
  );
}

const TABLES: Record<DeletableTable, string> = {
  portfolios: "/portfolios",
  cashflows: "/cashflows",
  trades: "/trades",
  dividends: "/dividends",
};

export async function deleteAction(table: DeletableTable, id: number) {
  const user = await requireUser();
  if (!(table in TABLES)) throw new Error("invalid table");
  deleteRow(user.id, table, id);
  revalidatePath("/", "layout");
}
