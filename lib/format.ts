/** Currency every cross-portfolio total is converted to (via buildFx). */
export const BASE_CURRENCY = "THB";

import type { AssetType, CashSource, Portfolio } from "./data";

const nf = (digits: number) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const money = nf(2);

export const fmt = (n: number, digits = 2) =>
  (digits === 2 ? money : nf(digits)).format(n);

/** Quantities: crypto can have many decimals, shares usually none. */
export const fmtQty = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 8 }).format(n);

/** Unit prices: at least 2 decimals, up to 6 for small (crypto) prices, without trailing zeros. */
export const fmtPrice = (n: number) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(n) < 1 ? 6 : 5,
  }).format(n);

export const fmtPct = (n: number) =>
  `${n < 0 ? "−" : ""}${nf(2).format(Math.abs(n))}%`;

export const fmtSigned = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${money.format(Math.abs(n))}`;

/** 2024-05-08 → 08/05/2024, matching the old spreadsheet. */
export const fmtDate = (iso: string | null) =>
  iso ? iso.split("-").reverse().join("/") : "-";

export const toneClass = (n: number) =>
  n > 0 ? "text-pos" : n < 0 ? "text-neg" : "";

export const CURRENCY_FLAG: Record<string, string> = {
  THB: "🇹🇭",
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  HKD: "🇭🇰",
  SGD: "🇸🇬",
  CNY: "🇨🇳",
  AUD: "🇦🇺",
  VND: "🇻🇳",
};

export const ASSET_LABEL: Record<
  AssetType,
  { emoji: string; label: string; className: string }
> = {
  stock: {
    emoji: "🏢",
    label: "หุ้น",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  etf: {
    emoji: "🧺",
    label: "ETF",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  crypto: {
    emoji: "🪙",
    label: "Crypto",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

/** Crypto portfolios read better with a coin than a flag; others show their currency's flag. */
export const portfolioEmoji = (p: Pick<Portfolio, "kind" | "currency">) =>
  p.kind === "crypto" ? "🪙" : (CURRENCY_FLAG[p.currency] ?? "💼");

const SERIES_SLOTS = 8;
/**
 * A portfolio's chart color follows the portfolio (its position among all of the user's portfolios),
 * never its rank in the current view. Past 8 portfolios they share a neutral "other" color.
 */
export const seriesColor = (index: number) =>
  index < SERIES_SLOTS ? `var(--series-${index + 1})` : "var(--muted)";

/** Labels for where deposited money came from (see CashSource). */
export const CASH_SOURCE_LABEL: Record<
  CashSource,
  { emoji: string; label: string; hint: string }
> = {
  new: {
    emoji: "💰",
    label: "เงินใหม่",
    hint: "เงินจากกระเป๋า",
  },
  dividend: {
    emoji: "🎁",
    label: "ปันผลนำกลับ",
    hint: "ปันผลที่โบรกโอนออก แล้วนำกลับมาลงทุน (ทบต้น)",
  },
  realized: {
    emoji: "📈",
    label: "กำไรขาย (ย้อนหลัง)",
    hint: "กำไรจากการขายหุ้นที่นำกลับมาลงทุน (ทบต้น)",
  },
};
