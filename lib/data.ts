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
  /** true: dividends are credited to portfolio cash; false: the broker pays them to a bank account. */
  dividendsToCash: boolean;
  /** Cash at the broker as last entered by the owner (portfolio currency); null = not entered yet. */
  cashBalance: number | null;
  cashUpdatedAt: string | null;
  note: string;
};

/** Where deposited money came from. Only meaningful for deposits; withdrawals are always 'new'. */
export type CashSource = "new" | "dividend" | "realized";
export const CASH_SOURCES = ["new", "dividend", "realized"] as const;

const PORTFOLIO_COLUMNS =
  "id, name, kind, currency, dividends_to_cash AS dividendsToCash, cash_balance AS cashBalance, cash_updated_at AS cashUpdatedAt, note";
type PortfolioRow = Omit<Portfolio, "dividendsToCash"> & {
  dividendsToCash: 0 | 1;
};
const toPortfolio = (r: PortfolioRow): Portfolio => ({
  ...r,
  dividendsToCash: r.dividendsToCash === 1,
});

export type Cashflow = {
  id: number;
  portfolioId: number;
  type: "deposit" | "withdraw";
  /** In the portfolio's currency. */
  amount: number;
  /** Baht actually transferred; equals amount for THB portfolios. */
  amountThb: number | null;
  source: CashSource;
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

/** Opening position copied from the broker (ยอดยกมา): trades on or before asOf are already included. */
export type Position = {
  id: number;
  portfolioId: number;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  asOf: string;
  /** Highest trade id when the snapshot was saved; same-day trades added later still count. */
  coversTradeId: number;
};

export type Price = { symbol: string; price: number; updatedAt: string };

export type FxRate = { currency: string; rate: number; updatedAt: string };

// Every query is scoped by user_id; callers get userId from requireUser().

export const listPortfolios = (userId: number) =>
  (
    getDb()
      .prepare(
        `SELECT ${PORTFOLIO_COLUMNS} FROM portfolios WHERE user_id = ? ORDER BY id`,
      )
      .all(userId) as PortfolioRow[]
  ).map(toPortfolio);

export const listCashflows = (userId: number) =>
  getDb()
    .prepare(
      `SELECT id, portfolio_id AS portfolioId, type, amount, amount_thb AS amountThb, source, date, account, note
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

export const listPositions = (userId: number) =>
  getDb()
    .prepare(
      `SELECT id, portfolio_id AS portfolioId, symbol, asset_type AS assetType, quantity, avg_cost AS avgCost, as_of AS asOf, covers_trade_id AS coversTradeId
         FROM positions WHERE user_id = ? ORDER BY symbol`,
    )
    .all(userId) as Position[];

export function getPortfolio(userId: number, portfolioId: number) {
  const row = getDb()
    .prepare(
      `SELECT ${PORTFOLIO_COLUMNS} FROM portfolios WHERE id = ? AND user_id = ?`,
    )
    .get(portfolioId, userId) as PortfolioRow | undefined;
  return row ? toPortfolio(row) : undefined;
}

// ---- mutations ----

export function savePortfolio(
  userId: number,
  id: number | null,
  p: Omit<Portfolio, "id" | "cashBalance" | "cashUpdatedAt">,
) {
  if (id) {
    getDb()
      .prepare(
        "UPDATE portfolios SET name = ?, kind = ?, currency = ?, dividends_to_cash = ?, note = ? WHERE id = ? AND user_id = ?",
      )
      .run(
        p.name,
        p.kind,
        p.currency,
        p.dividendsToCash ? 1 : 0,
        p.note,
        id,
        userId,
      );
  } else {
    getDb()
      .prepare(
        "INSERT INTO portfolios (user_id, name, kind, currency, dividends_to_cash, note) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        userId,
        p.name,
        p.kind,
        p.currency,
        p.dividendsToCash ? 1 : 0,
        p.note,
      );
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
    c.type === "deposit" ? c.source : "new",
    c.date,
    c.account,
    c.note,
  ];
  if (id) {
    getDb()
      .prepare(
        `UPDATE cashflows SET portfolio_id = ?, type = ?, amount = ?, amount_thb = ?, source = ?, date = ?, account = ?, note = ?
        WHERE id = ? AND user_id = ?`,
      )
      .run(...args, id, userId);
  } else {
    getDb()
      .prepare(
        `INSERT INTO cashflows (portfolio_id, type, amount, amount_thb, source, date, account, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

/** Owner-entered broker cash for one portfolio; null clears it. */
export function saveCashBalance(
  userId: number,
  portfolioId: number,
  amount: number | null,
) {
  getDb()
    .prepare(
      "UPDATE portfolios SET cash_balance = ?, cash_updated_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ? AND user_id = ?",
    )
    .run(amount, amount, portfolioId, userId);
}

/** Sets (or replaces) the opening position for one symbol in one portfolio. */
export function savePosition(
  userId: number,
  p: Omit<Position, "id" | "coversTradeId">,
) {
  const db = getDb();
  const { last } = db
    .prepare(
      "SELECT coalesce(max(id), 0) AS last FROM trades WHERE user_id = ?",
    )
    .get(userId) as { last: number };
  db.prepare(
    `INSERT INTO positions (user_id, portfolio_id, symbol, asset_type, quantity, avg_cost, as_of, covers_trade_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, portfolio_id, symbol) DO UPDATE SET
       asset_type = excluded.asset_type, quantity = excluded.quantity, avg_cost = excluded.avg_cost,
       as_of = excluded.as_of, covers_trade_id = excluded.covers_trade_id, updated_at = datetime('now')`,
  ).run(
    userId,
    p.portfolioId,
    p.symbol,
    p.assetType,
    p.quantity,
    p.avgCost,
    p.asOf,
    last,
  );
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
