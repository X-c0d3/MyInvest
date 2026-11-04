import "server-only";
import { getDb } from "./db";

export type PortfolioKind = "stock" | "crypto";
export type AssetType = "stock" | "etf" | "crypto";

export const CURRENCIES = [
  "THB",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "SGD",
  "CNY",
  "AUD",
  "VND",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Portfolio = {
  id: number;
  name: string;
  kind: PortfolioKind;
  currency: Currency;
  note: string;
};

export type Cashflow = {
  id: number;
  portfolioId: number;
  type: "deposit" | "withdraw";
  /** In the portfolio's currency. */
  amount: number;
  /** Baht actually transferred; equals amount for THB portfolios. */
  amountThb: number | null;
  date: string;
  account: string;
  note: string;
};

export type Trade = {
  id: number;
  portfolioId: number;
  symbol: string;
  assetType: AssetType;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  date: string;
  broker: string;
  note: string;
};

export type Dividend = {
  id: number;
  portfolioId: number;
  symbol: string;
  shares: number;
  dps: number;
  taxRate: number;
  xdDate: string | null;
  paidDate: string;
  note: string;
};

export type Price = { symbol: string; price: number; updatedAt: string };

export type FxRate = { currency: string; rate: number; updatedAt: string };

// Every query is scoped by user_id; callers get userId from requireUser().

export const listPortfolios = (userId: number) =>
  getDb()
    .prepare(
      "SELECT id, name, kind, currency, note FROM portfolios WHERE user_id = ? ORDER BY id",
    )
    .all(userId) as Portfolio[];

export const listCashflows = (userId: number) =>
  getDb()
    .prepare(
      `SELECT id, portfolio_id AS portfolioId, type, amount, amount_thb AS amountThb, date, account, note
         FROM cashflows WHERE user_id = ? ORDER BY date DESC, id DESC`,
    )
    .all(userId) as Cashflow[];

export const listTrades = (userId: number) =>
  getDb()
    .prepare(
      `SELECT id, portfolio_id AS portfolioId, symbol, asset_type AS assetType, side, quantity, price, fee, date, broker, note
         FROM trades WHERE user_id = ? ORDER BY date DESC, id DESC`,
    )
    .all(userId) as Trade[];

export const listDividends = (userId: number) =>
  getDb()
    .prepare(
      `SELECT id, portfolio_id AS portfolioId, symbol, shares, dps, tax_rate AS taxRate,
              xd_date AS xdDate, paid_date AS paidDate, note
         FROM dividends WHERE user_id = ? ORDER BY paid_date DESC, id DESC`,
    )
    .all(userId) as Dividend[];

export const listPrices = (userId: number) =>
  getDb()
    .prepare(
      "SELECT symbol, price, updated_at AS updatedAt FROM prices WHERE user_id = ?",
    )
    .all(userId) as Price[];

export const listFxRates = (userId: number) =>
  getDb()
    .prepare(
      "SELECT currency, rate, updated_at AS updatedAt FROM fx_rates WHERE user_id = ?",
    )
    .all(userId) as FxRate[];

export function getPortfolio(userId: number, portfolioId: number) {
  return getDb()
    .prepare(
      "SELECT id, name, kind, currency, note FROM portfolios WHERE id = ? AND user_id = ?",
    )
    .get(portfolioId, userId) as Portfolio | undefined;
}

// ---- mutations ----

export function savePortfolio(
  userId: number,
  id: number | null,
  p: Omit<Portfolio, "id">,
) {
  if (id) {
    getDb()
      .prepare(
        "UPDATE portfolios SET name = ?, kind = ?, currency = ?, note = ? WHERE id = ? AND user_id = ?",
      )
      .run(p.name, p.kind, p.currency, p.note, id, userId);
  } else {
    getDb()
      .prepare(
        "INSERT INTO portfolios (user_id, name, kind, currency, note) VALUES (?, ?, ?, ?, ?)",
      )
      .run(userId, p.name, p.kind, p.currency, p.note);
  }
}

export function saveCashflow(
  userId: number,
  id: number | null,
  c: Omit<Cashflow, "id">,
) {
  const args = [
    c.portfolioId,
    c.type,
    c.amount,
    c.amountThb,
    c.date,
    c.account,
    c.note,
  ];
  if (id) {
    getDb()
      .prepare(
        `UPDATE cashflows SET portfolio_id = ?, type = ?, amount = ?, amount_thb = ?, date = ?, account = ?, note = ?
        WHERE id = ? AND user_id = ?`,
      )
      .run(...args, id, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO cashflows (portfolio_id, type, amount, amount_thb, date, account, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...args, userId);
  }
}

export function saveTrade(
  userId: number,
  id: number | null,
  t: Omit<Trade, "id">,
) {
  const args = [
    t.portfolioId,
    t.symbol,
    t.assetType,
    t.side,
    t.quantity,
    t.price,
    t.fee,
    t.date,
    t.broker,
    t.note,
  ];
  if (id) {
    getDb()
      .prepare(
        `UPDATE trades SET portfolio_id = ?, symbol = ?, asset_type = ?, side = ?, quantity = ?, price = ?, fee = ?,
              date = ?, broker = ?, note = ?
        WHERE id = ? AND user_id = ?`,
      )
      .run(...args, id, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO trades (portfolio_id, symbol, asset_type, side, quantity, price, fee, date, broker, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...args, userId);
  }
}

export function saveDividend(
  userId: number,
  id: number | null,
  d: Omit<Dividend, "id">,
) {
  const args = [
    d.portfolioId,
    d.symbol,
    d.shares,
    d.dps,
    d.taxRate,
    d.xdDate,
    d.paidDate,
    d.note,
  ];
  if (id) {
    getDb()
      .prepare(
        `UPDATE dividends SET portfolio_id = ?, symbol = ?, shares = ?, dps = ?, tax_rate = ?,
              xd_date = ?, paid_date = ?, note = ?
        WHERE id = ? AND user_id = ?`,
      )
      .run(...args, id, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO dividends (portfolio_id, symbol, shares, dps, tax_rate, xd_date, paid_date, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...args, userId);
  }
}

export function savePrice(userId: number, symbol: string, price: number) {
  getDb()
    .prepare(
      `INSERT INTO prices (user_id, symbol, price) VALUES (?, ?, ?)
     ON CONFLICT (user_id, symbol) DO UPDATE SET price = excluded.price, updated_at = datetime('now')`,
    )
    .run(userId, symbol, price);
}

export function saveFxRate(userId: number, currency: string, rate: number) {
  getDb()
    .prepare(
      `INSERT INTO fx_rates (user_id, currency, rate) VALUES (?, ?, ?)
     ON CONFLICT (user_id, currency) DO UPDATE SET rate = excluded.rate, updated_at = datetime('now')`,
    )
    .run(userId, currency, rate);
}

export function setGoal(userId: number, amount: number) {
  getDb()
    .prepare("UPDATE users SET goal_amount = ? WHERE id = ?")
    .run(amount, userId);
}

const DELETABLE = {
  portfolios: "portfolios",
  cashflows: "cashflows",
  trades: "trades",
  dividends: "dividends",
} as const;
export type DeletableTable = keyof typeof DELETABLE;

export function deleteRow(userId: number, table: DeletableTable, id: number) {
  getDb()
    .prepare(`DELETE FROM ${DELETABLE[table]} WHERE id = ? AND user_id = ?`)
    .run(id, userId);
}
