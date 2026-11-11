import "server-only";
import { computePositions } from "./calc";
import {
  listPortfolios,
  listPositions,
  listPrices,
  listTrades,
  savePrice,
  type Price,
} from "./data";
import { fetchQuote } from "./quotes";

/** A stored price older than this is fetched again when a page that shows values loads. */
export const PRICE_MAX_AGE_MINUTES = 15;
const MAX_AGE_MS = PRICE_MAX_AGE_MINUTES * 60_000;

/**
 * Symbols with no free quote (e.g. warrants) would be retried on every page load; remember a
 * failed attempt per user and symbol for the same window so pages stay fast.
 */
const lastFailure = new Map<string, number>();

/** SQLite datetime('now') is UTC without a zone marker. */
export const parseDbTime = (s: string) => Date.parse(`${s.replace(" ", "T")}Z`);

/**
 * Fetches fresh prices for the user's current holdings whose stored price is missing or older
 * than PRICE_MAX_AGE_MINUTES (all of them when `force`). A price that can't be fetched keeps
 * the stored (possibly hand-entered) value.
 */
export async function refreshPrices(
  userId: number,
  { force = false }: { force?: boolean } = {},
) {
  const portfolios = listPortfolios(userId);
  const currencyOf = new Map(portfolios.map((p) => [p.id, p.currency]));
  const { holdings } = computePositions(
    listTrades(userId),
    [],
    listPositions(userId),
  );
  const stored = new Map(listPrices(userId).map((p) => [p.symbol, p]));
  const now = Date.now();

  const due = new Map<string, (typeof holdings)[number]>();
  for (const h of holdings) {
    if (h.quantity <= 0 || due.has(h.symbol)) continue;
    const price = stored.get(h.symbol);
    const fresh = price && now - parseDbTime(price.updatedAt) < MAX_AGE_MS;
    const failedRecently =
      now - (lastFailure.get(`${userId}:${h.symbol}`) ?? 0) < MAX_AGE_MS;
    if (force || (!fresh && !failedRecently)) due.set(h.symbol, h);
  }

  const results = await Promise.all(
    [...due.values()].map(async (h) => ({
      symbol: h.symbol,
      price: await fetchQuote(
        h.symbol,
        h.assetType,
        currencyOf.get(h.portfolioId) ?? "THB",
      ),
    })),
  );
  for (const r of results) {
    if (r.price === null) lastFailure.set(`${userId}:${r.symbol}`, now);
    else {
      lastFailure.delete(`${userId}:${r.symbol}`);
      savePrice(userId, r.symbol, r.price);
    }
  }
  return {
    updated: results.filter((r) => r.price !== null).length,
    failed: results.filter((r) => r.price === null).map((r) => r.symbol),
  };
}

/**
 * For the holdings header: when prices were last fetched, and which symbols are still on an old
 * (hand-entered) price because no free source has them.
 */
export function priceFreshness(prices: Price[], symbols: string[]) {
  const at = new Map(prices.map((p) => [p.symbol, parseDbTime(p.updatedAt)]));
  const now = Date.now();
  const times = symbols.map((s) => at.get(s)).filter((t) => t !== undefined);
  return {
    lastUpdate: times.length ? Math.max(...times) : null,
    manual: [...new Set(symbols)].filter((s) => {
      const t = at.get(s);
      return t === undefined || now - t > MAX_AGE_MS;
    }),
  };
}
