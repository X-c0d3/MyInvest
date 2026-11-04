import type { AssetType } from "./data";

const nf = (digits: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const money = nf(2);

export const fmt = (n: number, digits = 2) => (digits === 2 ? money : nf(digits)).format(n);

/** Quantities: crypto can have many decimals, shares usually none. */
export const fmtQty = (n: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 8 }).format(n);

/** Unit prices: small crypto prices need more decimals. */
export const fmtPrice = (n: number) => fmt(n, n !== 0 && Math.abs(n) < 1 ? 6 : 2);

export const fmtPct = (n: number) => `${n < 0 ? "−" : ""}${nf(2).format(Math.abs(n))}%`;

export const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money.format(Math.abs(n))}`;

/** 2024-05-08 → 08/05/2024, matching the old spreadsheet. */
export const fmtDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "-");

export const toneClass = (n: number) => (n > 0 ? "text-pos" : n < 0 ? "text-neg" : "");

export const CURRENCY_FLAG: Record<string, string> = {
  THB: "🇹🇭", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", HKD: "🇭🇰", SGD: "🇸🇬", CNY: "🇨🇳", AUD: "🇦🇺", VND: "🇻🇳",
};

export const ASSET_LABEL: Record<AssetType, { emoji: string; label: string; className: string }> = {
  stock: { emoji: "🏢", label: "หุ้น", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  etf: { emoji: "🧺", label: "ETF", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  crypto: { emoji: "🪙", label: "Crypto", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};
