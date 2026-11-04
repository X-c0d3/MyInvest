import type {
  AssetType,
  Cashflow,
  Dividend,
  FxRate,
  Portfolio,
  Position,
  Price,
  Trade,
} from "./data";

export const dividendGross = (d: Dividend) => d.shares * d.dps;
export const dividendTax = (d: Dividend) =>
  (dividendGross(d) * d.taxRate) / 100;
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
export function buildFx(
  portfolios: Portfolio[],
  cashflows: Cashflow[],
  rates: FxRate[],
): Fx {
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

  const resolved = new Map<string, { rate: number; source: FxSource }>([
    ["THB", { rate: 1, source: "base" }],
  ]);
  for (const ccy of new Set(portfolios.map((p) => p.currency))) {
    if (ccy === "THB") continue;
    const m = manual.get(ccy);
    const s = sums.get(ccy);
    if (m) resolved.set(ccy, { rate: m, source: "manual" });
    else if (s && s.amount > 0)
      resolved.set(ccy, { rate: s.thb / s.amount, source: "average" });
    else resolved.set(ccy, { rate: 0, source: "missing" });
  }

  const get = (ccy: string) =>
    resolved.get(ccy) ??
    (manual.has(ccy)
      ? { rate: manual.get(ccy)!, source: "manual" as const }
      : { rate: 0, source: "missing" as const });
  return {
    rate: (ccy) => get(ccy).rate,
    source: (ccy) => get(ccy).source,
    rateOf: (id) => get(currencyOf.get(id) ?? "THB").rate,
    missing: [...resolved]
      .filter(([, v]) => v.source === "missing")
      .map(([k]) => k),
  };
}

/** Baht value of a cashflow: what was actually transferred if known, else converted at today's rate. */
export const cashflowThb = (c: Cashflow, fx: Fx) =>
  c.amountThb ?? c.amount * fx.rateOf(c.portfolioId);
const signed = (c: Cashflow, n: number) => (c.type === "deposit" ? n : -n);

/**
 * Capital (เงินต้น) is every deposit minus every withdrawal: the owner counts money moved back in
 * (dividends, sale profit) as compounding capital (เงินทบต้น), as the old sheet did.
 * `source` only says where a deposit came from: 'new' = fresh money, 'dividend' / 'realized' = compounding.
 */
export const isFreshMoney = (c: Cashflow) =>
  c.type === "withdraw" || c.source === "new";

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
  /** Date of the opening position this holding starts from, if any. */
  asOf: string | null;
};

export type RealizedTrade = {
  tradeId: number;
  portfolioId: number;
  year: number;
  pnl: number;
};

export type Positions = {
  holdings: Holding[];
  realized: RealizedTrade[];
  /** Trades already contained in an opening position (dated on or before its asOf). */
  skipped: Set<number>;
  /** Cost of opening positions per portfolio (treated as a buy for the ledger). */
  openingCost: Map<number, number>;
};

/**
 * Builds holdings from opening positions (ยอดยกมา, copied from the broker) plus trades.
 * Trades are replayed oldest-first using the average-cost method (as Thai brokers report);
 * trades already contained in a symbol's opening position are skipped.
 * Buy fees are added to cost; sell fees are deducted from proceeds. Amounts stay in the portfolio's currency.
 */
export function computePositions(
  trades: Trade[],
  prices: Price[],
  openings: Position[] = [],
): Positions {
  const priceMap = new Map(prices.map((p) => [p.symbol, p.price]));
  type Pos = {
    portfolioId: number;
    symbol: string;
    assetType: AssetType;
    qty: number;
    cost: number;
    asOf: string | null;
    coversTradeId: number;
  };
  const positions = new Map<string, Pos>();
  const realized: RealizedTrade[] = [];
  const skipped = new Set<number>();
  const openingCost = new Map<number, number>();

  for (const o of openings) {
    positions.set(`${o.portfolioId}:${o.symbol}`, {
      portfolioId: o.portfolioId,
      symbol: o.symbol,
      assetType: o.assetType,
      qty: o.quantity,
      cost: o.quantity * o.avgCost,
      asOf: o.asOf,
      coversTradeId: o.coversTradeId,
    });
    openingCost.set(
      o.portfolioId,
      (openingCost.get(o.portfolioId) ?? 0) + o.quantity * o.avgCost,
    );
  }

  const ordered = [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
  for (const t of ordered) {
    const key = `${t.portfolioId}:${t.symbol}`;
    const pos = positions.get(key) ?? {
      portfolioId: t.portfolioId,
      symbol: t.symbol,
      assetType: t.assetType,
      qty: 0,
      cost: 0,
      asOf: null,
      coversTradeId: 0,
    };
    // Already inside the opening position: anything dated before it, or same-day trades that existed when it was saved.
    if (
      pos.asOf &&
      (t.date < pos.asOf || (t.date === pos.asOf && t.id <= pos.coversTradeId))
    ) {
      skipped.add(t.id);
      continue;
    }
    pos.assetType = t.assetType;
    if (t.side === "buy") {
      pos.qty += t.quantity;
      pos.cost += t.quantity * t.price + t.fee;
    } else {
      const avg = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const sellQty = Math.min(t.quantity, pos.qty);
      const pnl = t.quantity * t.price - t.fee - avg * sellQty;
      realized.push({
        tradeId: t.id,
        portfolioId: t.portfolioId,
        year: yearOf(t.date),
        pnl,
      });
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
        asOf: p.asOf,
      };
    });

  return { holdings, realized, skipped, openingCost };
}

// ---- yearly summary (THB) ----

export type YearRow = {
  year: number;
  /** All deposits (fresh + reinvested). */
  deposit: number;
  /** Fresh money from the owner's pocket. */
  fresh: number;
  /** Dividends moved back in ('dividend' deposits). */
  reinvestedDividend: number;
  /** Back-dated sale profit recorded as deposits ('realized'). */
  reinvestedRealized: number;
  withdraw: number;
  /** เงินเก็บสุทธิ: all deposits − withdrawals (change in capital). */
  netDeposit: number;
  dividendNet: number;
  dividendTax: number;
  /** Realized P/L of recorded trades. */
  realized: number;
  /** เงินต้นสะสม (รวมทบต้น) ณ สิ้นปี */
  capital: number;
  dividendYieldPct: number;
  /** (กำไรที่ขายแล้ว + ปันผลสุทธิ) ÷ เงินต้นสะสม (รวมทบต้น) ณ สิ้นปี */
  returnPct: number;
};

/** All amounts in THB. Foreign dividends and realized gains are converted at today's rate. */
export function yearlySummary(
  cashflows: Cashflow[],
  dividends: Dividend[],
  realized: RealizedTrade[],
  fx: Fx,
): YearRow[] {
  const rows = new Map<number, YearRow>();
  const row = (year: number) => {
    let r = rows.get(year);
    if (!r) {
      r = {
        year,
        deposit: 0,
        fresh: 0,
        reinvestedDividend: 0,
        reinvestedRealized: 0,
        withdraw: 0,
        netDeposit: 0,
        dividendNet: 0,
        dividendTax: 0,
        realized: 0,
        capital: 0,
        dividendYieldPct: 0,
        returnPct: 0,
      };
      rows.set(year, r);
    }
    return r;
  };

  for (const c of cashflows) {
    const r = row(yearOf(c.date));
    const thb = cashflowThb(c, fx);
    if (c.type === "withdraw") {
      r.withdraw += thb;
      continue;
    }
    r.deposit += thb;
    if (c.source === "dividend") r.reinvestedDividend += thb;
    else if (c.source === "realized") r.reinvestedRealized += thb;
    else r.fresh += thb;
  }
  for (const d of dividends) {
    const r = row(yearOf(d.paidDate));
    r.dividendNet += dividendNet(d) * fx.rateOf(d.portfolioId);
    r.dividendTax += dividendTax(d) * fx.rateOf(d.portfolioId);
  }
  for (const t of realized)
    row(t.year).realized += t.pnl * fx.rateOf(t.portfolioId);

  let capital = 0;
  return [...rows.values()]
    .sort((a, b) => a.year - b.year)
    .map((r) => {
      r.netDeposit = r.deposit - r.withdraw;
      capital += r.netDeposit;
      r.capital = capital;
      r.dividendYieldPct = capital > 0 ? (r.dividendNet / capital) * 100 : 0;
      r.returnPct =
        capital > 0 ? ((r.realized + r.dividendNet) / capital) * 100 : 0;
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
  /** เงินต้น (รวมทบต้น): all deposits − withdrawals (baht actually transferred). */
  capitalThb: number;
  /** Dividends and back-dated sale profit moved back into the portfolio. */
  reinvestedThb: number;
  /** Net dividends still outside the portfolio (paid to the bank and not moved back in). */
  dividendsOutsideThb: number;
  /** Cash at the broker as entered by the owner (0 until entered). */
  cashThb: number;
  cashEntered: boolean;
  /** Cash implied by the recorded deposits and trades (what the app would expect at the broker). */
  ledgerCashThb: number;
  /**
   * Actual cash − ledger cash: results of trades that were never recorded (the owner entered only
   * current holdings), usually a past trading loss. Part of the profit, shown separately.
   */
  untrackedThb: number;
  valueThb: number;
  dividendsThb: number;
  realizedThb: number;
  unrealizedThb: number;
  /** มูลค่าวันนี้ + ปันผลที่ยังอยู่นอกพอร์ต − เงินต้น (รวมทบต้น) (รวมผลจากค่าเงินด้วย) */
  profitThb: number;
  profitPct: number;
  byAssetThb: Record<AssetType, number>;
};

/**
 * มูลค่าพอร์ต = เงินสดในโบรก (ที่ผู้ใช้กรอก) + มูลค่าหลักทรัพย์ (ราคาล่าสุด หรือราคาทุนถ้ายังไม่ได้ใส่ราคา).
 * Ledger cash (every deposit, dividends only when credited to the portfolio, minus buys plus sells)
 * is kept for comparison: with an incomplete trade history it is not real money.
 */
export function summarizePortfolio(
  portfolio: Portfolio,
  cashflows: Cashflow[],
  trades: Trade[],
  dividends: Dividend[],
  pos: Positions,
  fx: Fx,
): PortfolioSummary {
  const { holdings, realized } = pos;
  const own = <T extends { portfolioId: number }>(xs: T[]) =>
    xs.filter((x) => x.portfolioId === portfolio.id);
  const myCashflows = own(cashflows);
  const myHoldings = own(holdings);
  const rate = fx.rate(portfolio.currency);
  const sum = (xs: Cashflow[], f: (c: Cashflow) => number) =>
    xs.reduce((s, c) => s + signed(c, f(c)), 0);
  const native = (c: Cashflow) => c.amount;
  const thb = (c: Cashflow) => cashflowThb(c, fx);

  const capitalFlows = myCashflows;
  const dividendBack = myCashflows.filter(
    (c) => c.type === "deposit" && c.source === "dividend",
  );
  const realizedBack = myCashflows.filter(
    (c) => c.type === "deposit" && c.source === "realized",
  );

  const capital = sum(capitalFlows, native);
  const capitalThb = sum(capitalFlows, thb);
  const cashIn = sum(myCashflows, native);
  const divs = own(dividends).reduce((s, d) => s + dividendNet(d), 0);
  const dividendsBack = sum(dividendBack, native);
  const tradeCash =
    -(pos.openingCost.get(portfolio.id) ?? 0) +
    own(trades)
      .filter((t) => !pos.skipped.has(t.id))
      .reduce(
        (s, t) =>
          s +
          (t.side === "buy"
            ? -(t.quantity * t.price + t.fee)
            : t.quantity * t.price - t.fee),
        0,
      );
  const ledgerCash =
    cashIn + (portfolio.dividendsToCash ? divs : 0) + tradeCash;
  const cash = portfolio.cashBalance ?? 0;
  const holdingsValue = myHoldings.reduce((s, h) => s + h.marketValue, 0);
  const costBasis = myHoldings.reduce((s, h) => s + h.costBasis, 0);
  const value = cash + holdingsValue;
  const realizedSum = own(realized).reduce((s, r) => s + r.pnl, 0);
  const dividendsOutside = portfolio.dividendsToCash ? 0 : divs - dividendsBack;
  const valueThb = value * rate;
  const dividendsOutsideThb = dividendsOutside * rate;
  const profitThb = valueThb + dividendsOutsideThb - capitalThb;

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
    reinvestedThb: sum(dividendBack, thb) + sum(realizedBack, thb),
    dividendsOutsideThb,
    cashThb: cash * rate,
    cashEntered: portfolio.cashBalance !== null,
    ledgerCashThb: ledgerCash * rate,
    untrackedThb: (cash - ledgerCash) * rate,
    valueThb,
    dividendsThb: divs * rate,
    realizedThb: realizedSum * rate,
    unrealizedThb: (holdingsValue - costBasis) * rate,
    profitThb,
    profitPct: capitalThb > 0 ? (profitThb / capitalThb) * 100 : 0,
    byAssetThb,
  };
}
