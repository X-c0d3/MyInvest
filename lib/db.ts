import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "myinvest.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  goal_amount   REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('stock', 'crypto')),
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cashflows (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw')),
  amount       REAL NOT NULL CHECK (amount > 0),
  date         TEXT NOT NULL,
  account      TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  side         TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity     REAL NOT NULL CHECK (quantity > 0),
  price        REAL NOT NULL CHECK (price >= 0),
  fee          REAL NOT NULL DEFAULT 0,
  date         TEXT NOT NULL,
  broker       TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS dividends (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  shares       REAL NOT NULL CHECK (shares > 0),
  dps          REAL NOT NULL CHECK (dps >= 0),
  tax_rate     REAL NOT NULL DEFAULT 10,
  xd_date      TEXT,
  paid_date    TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS prices (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  price      REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_cashflows_user ON cashflows(user_id, date);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, date);
CREATE INDEX IF NOT EXISTS idx_dividends_user ON dividends(user_id, paid_date);
`;

// Applied in order on top of SCHEMA; PRAGMA user_version records how many have run.
const MIGRATIONS = [
  // v1: multi-currency portfolios, ETF / asset type, THB amount actually transferred, FX rates.
  `ALTER TABLE portfolios ADD COLUMN currency TEXT NOT NULL DEFAULT 'THB';
   ALTER TABLE trades ADD COLUMN asset_type TEXT NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'etf', 'crypto'));
   UPDATE trades SET asset_type = 'crypto'
    WHERE portfolio_id IN (SELECT id FROM portfolios WHERE kind = 'crypto');
   ALTER TABLE cashflows ADD COLUMN amount_thb REAL;
   UPDATE cashflows SET amount_thb = amount;
   CREATE TABLE fx_rates (
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     currency   TEXT NOT NULL,
     rate       REAL NOT NULL CHECK (rate > 0),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, currency)
   );`,
  // v2: separate the owner's own money from returns moved back in.
  //  - cashflows.source (deposits only): 'new' = fresh money (capital),
  //    'dividend' = dividends paid out to the bank and re-deposited (cash, not capital),
  //    'realized' = back-dated sale profit recorded as a deposit before trades were tracked (a return, not capital).
  //  - portfolios.dividends_to_cash: 0 = the broker pays dividends to a bank account (Thai brokers), 1 = into portfolio cash.
  `ALTER TABLE cashflows ADD COLUMN source TEXT NOT NULL DEFAULT 'new' CHECK (source IN ('new', 'dividend', 'realized'));
   ALTER TABLE portfolios ADD COLUMN dividends_to_cash INTEGER NOT NULL DEFAULT 0 CHECK (dividends_to_cash IN (0, 1));`,
];

function migrate(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Opened lazily (not at import, so parallel build workers don't fight over the lock)
// and kept on globalThis so dev hot reloads reuse one connection.
const globalForDb = globalThis as unknown as {
  __myinvestDb?: Database.Database;
};

export function getDb() {
  globalForDb.__myinvestDb ??= open();
  return globalForDb.__myinvestDb;
}
