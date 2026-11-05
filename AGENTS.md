<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MyInvest — guide for AI agents

Personal investment tracker that replaces the owner's Google Sheet. It records deposits and withdrawals, trades (Thai stocks, ETFs, foreign stocks, crypto) and dividends, then computes holdings, P/L, yearly returns and progress toward a goal. It supports multiple users with login, and each user's data is isolated.

**The UI is in Thai.** Write every user-facing string in Thai and keep code and comments in English. The owner talks in Thai, so answer in Thai.

## Stack

- Next.js 16 App Router with `cacheComponents` and `partialPrefetching` on, React 19, TypeScript, Tailwind CSS v4
- SQLite via `better-sqlite3`: no ORM, no API routes. Server Components read through `lib/data.ts`, and mutations are Server Actions.
- `lucide-react` provides the icons. Charts are hand-built HTML/CSS with no chart library.

## Commands

| Task | Command |
| --- | --- |
| Dev server (owner usually runs it on :3000) | `npm run dev` |
| Type check | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Format touched files | `npx prettier --write <files>` (default config) |

There is no test suite. Verify with type check, lint, build, and a look in the browser (see "Verifying UI changes").

## Where things are

| Path | What |
| --- | --- |
| `lib/db.ts` | Lazy SQLite connection, base `SCHEMA`, and the `MIGRATIONS` array (tracked by `PRAGMA user_version`) |
| `lib/auth.ts` | scrypt password hashing, sessions (random token, SHA-256 stored), `requireUser()` |
| `lib/data.ts` | Every query and mutation. Each takes `userId` |
| `lib/calc.ts` | Positions (average cost), FX, yearly summary, portfolio summary |
| `lib/format.ts` | Number/date formatting, currency flags, asset labels, `portfolioEmoji`, `seriesColor` |
| `lib/chart.ts` | `niceMax`, `compact` for chart axes |
| `app/actions.ts` | Entity Server Actions (`handle()` wrapper, `ValidationError`) |
| `app/auth-actions.ts` | Login, register, logout, change password, log out other devices |
| `app/(main)/*` | Signed-in pages: `/` dashboard, `holdings`, `trades`, `dividends`, `cashflows`, `portfolios`, `account` |
| `app/(auth)/*` | Login / register |
| `components/ui.tsx` | Shared building blocks (see UI conventions) |
| `components/form-modal.tsx`, `action-form.tsx`, `delete-button.tsx` | Form plumbing |
| `components/*-chart.tsx` | Charts |
| `proxy.ts` | Optimistic redirect to `/login` when there is no session cookie (Next 16 renamed middleware to proxy) |
| `scripts/make-test-db.mjs` | Makes a safe copy of the database for testing |

## Hard rules

### Data and security
- **`data/` holds the owner's real data and is gitignored.** Never delete, reset, migrate by hand, or write test rows into `data/myinvest.db`. Read-only queries are fine. Write to it only when the owner explicitly asks, for example to import rows from their spreadsheet.
- Every page and every Server Action starts with `await requireUser()`. Never take a user id from the client.
- Every query filters by `user_id`; every `UPDATE`/`DELETE` includes `AND user_id = ?`. A portfolio id coming from a form goes through `getPortfolio(userId, id)`.
- Schema changes: **append** a new entry to `MIGRATIONS` in `lib/db.ts`. Never edit an existing migration or change `SCHEMA` in a way that breaks an existing database.

### Next.js 16 specifics
- With `cacheComponents`, reading the time or the request outside a dynamic scope errors. Pages in `app/(main)` export `instant = false` and call `requireUser()` first (it calls `connection()`), and only then use `Date.now()`, `new Date()` or `today()`.
- Server Actions finish with `revalidatePath("/", "layout")` and then `redirect(...)` (the `handle()` wrapper does this).
- `next/script` with `strategy="beforeInteractive"` loads the theme script. A constant exported from a `"use client"` file reaches a Server Component as a client reference, not a value, so shared constants live in `lib/`.
- Read `node_modules/next/dist/docs/` before using an API you have not used in this repo.

### Money and calculations (`lib/calc.ts`)
- **Holdings start from opening positions (`positions` table, ยอดยกมา):** the owner copies quantity and average cost from the broker app on the holdings page. Trades the snapshot already covers (dated before `as_of`, or same day with `id <= covers_trade_id`) are skipped and marked "รวมในยอดหุ้นแล้ว" on the trades page. Later trades apply on top, using the average-cost method: buy fees are added to cost, and sell fees come out of proceeds.
- Keep the UI simple. The owner found ledger/gap breakdowns confusing, so show plain numbers (quantity, average cost, price, value, P/L) and avoid internal terms.
- Dividend gross = shares × dividend per share. `tax_rate` is a per-row % (Thai stocks are usually 10%, US 15%, and some rows differ).
- **Where money really goes (owner's setup):** sale proceeds stay in the portfolio as cash, but Thai brokers pay **dividends out to a bank account**. Each portfolio's `dividends_to_cash` says which applies; with 0 (the default) dividends do **not** add to portfolio cash.
- Every deposit has a `source`: `new` = fresh money, `dividend` = a dividend moved back in, `realized` = sale profit moved back in. **Capital (เงินต้น) = all deposits − withdrawals**: the owner counts money moved back in as compounding capital (เงินทบต้น), as the old sheet did. `source` is used only to show the fresh vs compounding split (`isFreshMoney()`).
- Total profit = portfolio value + dividends still outside the portfolio (paid out and not moved back in) − capital. Yearly return % = (realized P/L + net dividends) ÷ cumulative capital at year end.
- Each portfolio has a currency, and amounts are stored in that currency. `cashflows.amount_thb` is the baht actually transferred (equal to `amount` for THB portfolios). `buildFx()` converts totals to THB using the owner's rate from `fx_rates`, or else the average rate implied by their deposits.
- Portfolio value = **cash at the broker as entered by the owner** (`portfolios.cash_balance`, 0 until entered) + holdings (latest price if set, otherwise cost). The owner entered only current holdings, not the full trade history, so cash derived from deposits − buys + sells ("ledger cash") is **not** real money. It is shown only for comparison. The gap `cash − ledger cash` is the result of unrecorded past trades (`untrackedThb`), counted with realized P/L on the dashboard.

### UI conventions
- **Never hardcode portfolio names or ids.** Build tabs, filters and legends from `listPortfolios()`. Use `portfolioEmoji(p)` for the icon (🪙 for crypto, otherwise the currency flag). Use `seriesColor(index)` for chart color, where the index is the portfolio's position in the **full** portfolio list, so a portfolio keeps its color when filters change.
- Colors come only from CSS tokens in `app/globals.css` (`bg-surface`, `bg-surface-2`, `text-muted`, `border-line`, `text-pos`/`bg-pos-soft`, `text-neg`/`bg-neg-soft`, `accent`, `--series-1..8`). Light and dark are set by `html[data-theme]`, and the `dark:` variant follows it. Any new color token needs both a light and a dark value.
- Forms: wrap fields in `ActionForm` (`useActionState`). Actions throw `ValidationError` with a Thai message, and `handle()` returns `{ error, values }` so the form refills itself. Add/edit forms live in `FormModal`, opened by the URL (`?new=1` / `?edit=<id>`). Saving redirects to the list URL, which closes the modal.
- Delete with `DeleteButton` (two-step confirm, no `confirm()` dialog). A new deletable table must be added to `DELETABLE` in `lib/data.ts`.
- Shared pieces in `components/ui.tsx`: `PageHeader`, `Card`, `Stat`, `Field`, `PortfolioSelect`, `PortfolioTabs`, `NewButton`, `RowActions`, `Money`, `AssetBadge`, `EmptyRow`, `pickPortfolio`, `pickEdit`, `today`. Reuse them rather than restyling by hand.
- Tables use `.table`, with `.num` for numeric cells. On phones (below 640px) lists are not tables: hide the table with `hidden sm:block` and render a `MobileList` of `MobileItem` rows (icon, title, details, amount on the right; tapping opens the edit modal). Put delete in the modal with `ModalDelete`, since phone rows have no buttons.
- Format with `lib/format.ts`: `fmt`, `fmtPct`, `fmtSigned`, `fmtPrice` (trims trailing zeros), `fmtQty`, `fmtDate` (dd/mm/yyyy, as in the old sheet).
- Keep pages compact: the owner works on a MacBook (about 1470×920). Charts are about 180px tall and stat tiles are short. The layout is capped at 2400px with a `w-56` sidebar. Check that new tables fit at 1470px without hiding columns behind the sticky action column.
- Charts: one value axis (never dual-axis), a legend whenever color means something, direct labels only on a few notable values, and a hover/focus tooltip on every column. The cash-flow chart shows paired columns, deposits (green) next to withdrawals (red), which the owner chose over stacked or diverging variants.
- Emoji and icons are part of the look (the owner asked for them). Keep emoji in headers, stat tiles and empty states consistent with existing pages.

## Verifying UI changes

- `next dev` allows only **one instance per project folder**, and the owner usually has one running on :3000. **Do not kill it.**
- Use a copy of the data instead:
  ```bash
  node scripts/make-test-db.mjs          # writes data/test.db, prints a throwaway login for user 1
  npm run build
  DATABASE_PATH=data/test.db npx next start -p 3001
  ```
  Open http://localhost:3001, check the change in **light and dark** themes and at **1470px and phone width**, then stop the server and delete `data/test.db*`.
- Full-page loads in dev mode take a few seconds to hydrate, so wait before concluding something is broken. Clicks dispatched from injected JS may not reach React; use real clicks.
- Start test servers from a shell. There is no `.claude/launch.json`, because the preview launcher does not load nvm and never started the app.

## Deployment (Docker)

- `next.config.ts` builds with `output: "standalone"`. `outputFileTracingExcludes` keeps `data/` out of the build, because the tracer follows the database path in `lib/db.ts`. **Never remove that exclude.**
- In the `Dockerfile`, `npm ci --ignore-scripts` stops npm from compiling better-sqlite3 with node-gyp (prebuilt binaries ship in the package). The runtime stage copies the whole `node_modules/better-sqlite3`, because the tracer keeps only the build machine's binary.
- `.dockerignore` must keep excluding `data`, `*.db*` and `.env*`, so real data and secrets never get baked into an image.
- `docker-compose.yml`: the `app` service listens on **port 3004** (the owner deploys on that port; `APP_PORT` changes the host side) and bind-mounts the host folder `DATA_DIR` (default `./data`) at `/app/data` (`DATABASE_PATH=/app/data/myinvest.db`), so backups are plain file copies; the folder must be owned by uid 1000. Caddy for HTTPS on `$DOMAIN` is optional and starts only with `--profile caddy`.
- Runtime env: `ALLOW_REGISTRATION` (sign-up is otherwise open only while there are no users) and `COOKIE_SECURE` (defaults to secure in production; must be `false` when served over plain http, or login won't stick).

## Importing from the old spreadsheet (only when asked)

The owner sends screenshots of Google Sheets tabs. To import:
1. Check which user and portfolio they belong to, and that no rows already exist in that date range (avoid duplicates).
2. Insert in one transaction with a small `better-sqlite3` script, using the exact amounts from the sheet. If a sheet's total disagrees with shares × price, keep the total and note it in the row.
3. Import "เงินจากกำไรปันผล" rows as deposits with `source = 'dividend'`, and "เงินจากกำไรขายหุ้น …" rows with `source = 'realized'`. Everything else is `source = 'new'`.
4. Compare yearly totals with the sheet's own summary and report any differences and assumptions, such as a missing or obviously mistyped date.
