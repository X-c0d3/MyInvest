import "server-only";
import type { AssetType } from "./data";

/**
 * Free, keyless "latest price" lookups (delayed about 15 minutes, not realtime):
 * - Stocks and ETFs: Yahoo Finance chart endpoint (unofficial). Thai symbols get the ".BK" suffix.
 * - Crypto in a THB portfolio: Bitkub public ticker (the owner's exchange).
 * Every lookup returns null on any problem, so callers simply keep the stored price.
 */

const TIMEOUT_MS = 5000;

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const positive = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

async function yahoo(code: string, currency: string) {
  const data = (await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?range=1d&interval=1d`,
  )) as {
    chart?: {
      result?: { meta?: { regularMarketPrice?: number; currency?: string } }[];
    };
  } | null;
  const meta = data?.chart?.result?.[0]?.meta;
  // A quote in another currency would be silently wrong, so it is ignored.
  if (!meta || meta.currency?.toUpperCase() !== currency) return null;
  return positive(meta.regularMarketPrice);
}

async function bitkub(symbol: string) {
  const data = (await getJson(
    `https://api.bitkub.com/api/v3/market/ticker?sym=${encodeURIComponent(`${symbol}_THB`)}`,
  )) as { last?: string }[] | null;
  return Array.isArray(data) ? positive(Number(data[0]?.last)) : null;
}

/** Latest price of a holding in its portfolio's currency, or null when no free source has it. */
export async function fetchQuote(
  symbol: string,
  assetType: AssetType,
  currency: string,
): Promise<number | null> {
  const sym = symbol.toUpperCase();
  if (assetType === "crypto") {
    return currency === "THB"
      ? bitkub(sym)
      : yahoo(`${sym}-${currency}`, currency);
  }
  return yahoo(currency === "THB" ? `${sym}.BK` : sym, currency);
}
