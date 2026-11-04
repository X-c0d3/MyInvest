import type { AssetType, Cashflow, Dividend, FxRate, Portfolio, Price, Trade } from "./data";

export const dividendGross = (d: Dividend) => d.shares * d.dps;
export const dividendTax = (d: Dividend) => (dividendGross(d) * d.taxRate) / 100;
export const dividendNet = (d: Dividend) => dividendGross(d) - dividendTax(d);
export const yearOf = (date: string) => Number(date.slice(0, 4));

// ---- FX ----

export type FxSource = "base" | "manual" | "average" | "missing";

export type Fx = {
  /** THB per 1 unit of the currency. */
  rate: (currency: string) => number;
  source: (currency: string) => FxSource;
  /** THB per 1 unit of the portfolio's currency. */
  rateOf: (portfolioId: number) => number;
  /** Foreign currencies in use that have no rate at all (values count as 0 THB). */
  missing: string[];
};

/**
 * Current rate = the one the user set; otherwise the average rate implied by their
 * foreign deposits (THB paid ÷ foreign amount received).
 */
export function buildFx(portfolios: Portfolio[], cashflows: Cashflow[], rates: FxRate[]): Fx {
  const manual = new Map(rates.map((r) => [r.currency, r.rate]));
  const currencyOf = new Map(portfolios.map((p) => [p.id, p.currency]));

  const sums = new Map<string, { thb: number; amount: number }>();
  for (const c of cashflows) {
    const ccy = currencyOf.get(c.portfolioId);
    if (!ccy || ccy === "THB" || c.amountThb === null) continue;
    const s = sums.get(ccy) ?? { thb: 0, amount: 0 };
    s.thb += c.amountThb;
    s.amount += c.amount;
    sums.set(ccy, s);
  }

  const resolved = new Map<string, { rate: number; source: FxSource }>([["THB", { rate: 1, source: "base" }]]);
  for (const ccy of new Set(portfolios.map((p) => p.currency))) {
    if (ccy === "THB") continue;
    const m = manual.get(ccy);
    const s = sums.get(ccy);
    if (m) resolved.set(ccy, { rate: m, source: "manual" });
    else if (s && s.amount > 0) resolved.set(ccy, { rate: s.thb / s.amount, source: "average" });
    else resolved.set(ccy, { rate: 0, source: "missing" });
  }

  const get = (ccy: string) => resolved.get(ccy) ?? (manual.has(ccy) ? { rate: manual.get(ccy)!, source: "manual" as const } : { rate: 0, source: "missing" as const });
  return {
    rate: (ccy) => get(ccy).rate,
    source: (ccy) => get(ccy).source,
    rateOf: (id) => get(currencyOf.get(id) ?? "THB").rate,
    missing: [...resolved].filter(([, v]) => v.source === "missing").map(([k]) => k),
  };
}

/** Baht value of a cashflow: what was actually transferred if known, else converted at today's rate. */
export const cashflowThb = (c: Cashflow, fx: Fx) => c.amountThb ?? c.amount * fx.rateOf(c.portfolioId);
const signed = (c: Cashflow, n: number) => (c.type === "deposit" ? n : -n);

// ---- positions ----

export type Holding = {
  portfolioId: number;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  costBasis: number;
  marketPrice: number | null;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
};

export type RealizedTrade = { tradeId: number; portfolioId: number; year: number; pnl: number };

/**
 * Replays trades oldest-first using the average-cost method (as Thai brokers report).
 * Buy fees are added to cost; sell fees are deducted from proceeds. Amounts stay in the portfolio's currency.
 */
export function computePositions(trades: Trade[], prices: Price[]) {
  const priceMap = new Map(prices.map((p) => [p.symbol, p.price]));
  const positions = new Map<string, { portfolioId: number; symbol: string; assetType: AssetType; qty: number; cost: number }>();
  const realized: RealizedTrade[] = [];

  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  for (const t of ordered) {
    const key = `${t.portfolioId}:${t.symbol}`;
    const pos = positions.get(key) ?? { portfolioId: t.portfolioId, symbol: t.symbol, assetType: t.assetType, qty: 0, cost: 0 };
    pos.assetType = t.assetType;
    if (t.side === "buy") {
      pos.qty += t.quantity;
      pos.cost += t.quantity * t.price + t.fee;
    } else {
      const avg = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const sellQty = Math.min(t.quantity, pos.qty);
      const pnl = t.quantity * t.price - t.fee - avg * sellQty;
      realized.push({ tradeId: t.id, portfolioId: t.portfolioId, year: yearOf(t.date), pnl });
      pos.qty -= sellQty;
      pos.cost -= avg * sellQty;
      if (pos.qty < 1e-9) {
        pos.qty = 0;
        pos.cost = 0;
      }
    }
    positions.set(key, pos);
  }

  const holdings: Holding[] = [...positions.values()]
    .filter((p) => p.qty > 0)
    .map((p) => {
      const marketPrice = priceMap.get(p.symbol) ?? null;
      const marketValue = marketPrice === null ? p.cost : marketPrice * p.qty;
      const unrealized = marketValue - p.cost;
      return {
        portfolioId: p.portfolioId,
        symbol: p.symbol,
        assetType: p.assetType,
        quantity: p.qty,
        avgCost: p.cost / p.qty,
        costBasis: p.cost,
        marketPrice,
        marketValue,
        unrealized,
        unrealizedPct: p.cost > 0 ? (unrealized / p.cost) * 100 : 0,
      };
    });

  return { holdings, realized };
}

// ---- yearly summary (THB) ----

export type YearRow = {
  year: number;
  deposit: number;
  withdraw: number;
  netDeposit: number;
  dividendNet: number;
  dividendTax: number;
  realized: number;
  /** เงินต้นสะสม ณ สิ้นปี (ฝาก − ถอน ตั้งแต่เริ่ม) */
  capital: number;
  dividendYieldPct: number;
  /** (กำไรที่ขายแล้ว + ปันผลสุทธิ) ÷ เงินต้นสะสม ณ สิ้นปี */
  returnPct: number;
};

/** All amounts in THB. Foreign dividends and realized gains are converted at today's rate. */
export function yearlySummary(cashflows: Cashflow[], dividends: Dividend[], realized: RealizedTrade[], fx: Fx): YearRow[] {
  const rows = new Map<number, YearRow>();
  const row = (year: number) => {
    let r = rows.get(year);
    if (!r) {
      r = { year, deposit: 0, withdraw: 0, netDeposit: 0, dividendNet: 0, dividendTax: 0, realized: 0, capital: 0, dividendYieldPct: 0, returnPct: 0 };
      rows.set(year, r);
    }
    return r;
  };

  for (const c of cashflows) {
    const r = row(yearOf(c.date));
    if (c.type === "deposit") r.deposit += cashflowThb(c, fx);
    else r.withdraw += cashflowThb(c, fx);
  }
  for (const d of dividends) {
    const r = row(yearOf(d.paidDate));
    r.dividendNet += dividendNet(d) * fx.rateOf(d.portfolioId);
    r.dividendTax += dividendTax(d) * fx.rateOf(d.portfolioId);
  }
  for (const t of realized) row(t.year).realized += t.pnl * fx.rateOf(t.portfolioId);

  let capital = 0;
  return [...rows.values()]
    .sort((a, b) => a.year - b.year)
    .map((r) => {
      r.netDeposit = r.deposit - r.withdraw;
      capital += r.netDeposit;
      r.capital = capital;
      r.dividendYieldPct = capital > 0 ? (r.dividendNet / capital) * 100 : 0;
      r.returnPct = capital > 0 ? ((r.realized + r.dividendNet) / capital) * 100 : 0;
      return r;
    });
}

// ---- portfolio summary ----

export type PortfolioSummary = {
  portfolio: Portfolio;
  fxRate: number;
  /** Native currency */
  capital: number;
  cash: number;
  holdingsValue: number;
  costBasis: number;
  value: number;
  dividends: number;
  realized: number;
  unrealized: number;
  /** THB */
  capitalThb: number;
  cashThb: number;
  valueThb: number;
  dividendsThb: number;
  realizedThb: number;
  unrealizedThb: number;
  /** มูลค่าวันนี้ (บาท) − เงินบาทที่โอนเข้าสุทธิ: รวมผลจากค่าเงินด้วย */
  profitThb: number;
  profitPct: number;
  byAssetThb: Record<AssetType, number>;
};

/** มูลค่าพอร์ต = เงินสดคงเหลือ + มูลค่าหลักทรัพย์ (ราคาล่าสุด หรือราคาทุนถ้ายังไม่ได้ใส่ราคา) */
export function summarizePortfolio(
  portfolio: Portfolio,
  cashflows: Cashflow[],
  trades: Trade[],
  dividends: Dividend[],
  holdings: Holding[],
  realized: RealizedTrade[],
  fx: Fx,
): PortfolioSummary {
  const own = <T extends { portfolioId: number }>(xs: T[]) => xs.filter((x) => x.portfolioId === portfolio.id);
  const myCashflows = own(cashflows);
  const myHoldings = own(holdings);
  const rate = fx.rate(portfolio.currency);

  const capital = myCashflows.reduce((s, c) => s + signed(c, c.amount), 0);
  const capitalThb = myCashflows.reduce((s, c) => s + signed(c, cashflowThb(c, fx)), 0);
  const divs = own(dividends).reduce((s, d) => s + dividendNet(d), 0);
  const tradeCash = own(trades).reduce(
    (s, t) => s + (t.side === "buy" ? -(t.quantity * t.price + t.fee) : t.quantity * t.price - t.fee),
    0,
  );
  const cash = capital + divs + tradeCash;
  const holdingsValue = myHoldings.reduce((s, h) => s + h.marketValue, 0);
  const costBasis = myHoldings.reduce((s, h) => s + h.costBasis, 0);
  const value = cash + holdingsValue;
  const realizedSum = own(realized).reduce((s, r) => s + r.pnl, 0);
  const valueThb = value * rate;
  const profitThb = valueThb - capitalThb;

  const byAssetThb: Record<AssetType, number> = { stock: 0, etf: 0, crypto: 0 };
  for (const h of myHoldings) byAssetThb[h.assetType] += h.marketValue * rate;

  return {
    portfolio,
    fxRate: rate,
    capital,
    cash,
    holdingsValue,
    costBasis,
    value,
    dividends: divs,
    realized: realizedSum,
    unrealized: holdingsValue - costBasis,
    capitalThb,
    cashThb: cash * rate,
    valueThb,
    dividendsThb: divs * rate,
    realizedThb: realizedSum * rate,
    unrealizedThb: (holdingsValue - costBasis) * rate,
    profitThb,
    profitPct: capitalThb > 0 ? (profitThb / capitalThb) * 100 : 0,
    byAssetThb,
  };
}
