import Link from "next/link";
import { Banknote, Briefcase, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { priceFreshness, refreshPrices } from "@/lib/prices";
import { refreshPricesAction } from "@/app/actions";
import {
  listCashflows,
  listDividends,
  listFxRates,
  listPortfolios,
  listPositions,
  listPrices,
  listTrades,
} from "@/lib/data";
import {
  buildFx,
  computePositions,
  dividendGross,
  dividendNet,
  dividendTax,
} from "@/lib/calc";
import { saveCashBalanceAction, savePositionAction } from "@/app/actions";
import {
  fmt,
  fmtDate,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSigned,
  portfolioEmoji,
  toneClass,
  ASSET_LABEL,
  BASE_CURRENCY,
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import {
  SymbolHistory,
  type HistoryDividend,
  type HistoryTrade,
} from "@/components/symbol-history";
import {
  AssetBadge,
  Card,
  EmptyRow,
  Field,
  Money,
  NewButton,
  PageHeader,
  PortfolioSelect,
  PortfolioTabs,
  pickPortfolio,
  Stat,
  MobileItem,
  MobileList,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function HoldingsPage({
  searchParams,
}: PageProps<"/holdings">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const current = pickPortfolio(portfolios, sp.p);
  // Latest prices from free sources when the stored ones are older than 15 minutes.
  await refreshPrices(user.id);
  const prices = listPrices(user.id);
  const cashflows = listCashflows(user.id);
  const trades = listTrades(user.id);
  const fx = buildFx(portfolios, cashflows, listFxRates(user.id));
  const { holdings: all, skipped } = computePositions(
    trades,
    prices,
    listPositions(user.id),
  );
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  // Latest recorded buy or sell per holding. A holding entered only as an opening position has none.
  const lastTradeDate = new Map<string, string>();
  for (const t of trades) {
    const key = `${t.portfolioId}:${t.symbol}`;
    if (t.date > (lastTradeDate.get(key) ?? "")) lastTradeDate.set(key, t.date);
  }
  // Every trade per holding, oldest first, for the history modal.
  const historyByHolding = new Map<string, HistoryTrade[]>();
  for (const t of [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  )) {
    const key = `${t.portfolioId}:${t.symbol}`;
    const list = historyByHolding.get(key) ?? [];
    list.push({
      id: t.id,
      date: t.date,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      fee: t.fee,
      covered: skipped.has(t.id),
    });
    historyByHolding.set(key, list);
  }
  // Dividends per holding, newest first, for the same modal.
  const dividendsByHolding = new Map<string, HistoryDividend[]>();
  for (const d of [...listDividends(user.id)].sort((a, b) =>
    b.paidDate.localeCompare(a.paidDate),
  )) {
    const key = `${d.portfolioId}:${d.symbol}`;
    const list = dividendsByHolding.get(key) ?? [];
    list.push({
      id: d.id,
      paidDate: d.paidDate,
      shares: d.shares,
      dps: d.dps,
      gross: dividendGross(d),
      tax: dividendTax(d),
      net: dividendNet(d),
    });
    dividendsByHolding.set(key, list);
  }
  const thb = (portfolioId: number, n: number) => n * fx.rateOf(portfolioId);
  // Price freshness for the holdings card header.
  const { lastUpdate: lastPriceUpdate, manual: manualPrice } = priceFreshness(
    prices,
    all.map((h) => h.symbol),
  );
  const timeFmt = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const holdings = (
    current ? all.filter((h) => h.portfolioId === current) : all
  ).sort(
    (a, b) =>
      thb(b.portfolioId, b.marketValue) - thb(a.portfolioId, a.marketValue),
  );
  const cost = holdings.reduce(
    (s, h) => s + thb(h.portfolioId, h.costBasis),
    0,
  );
  const value = holdings.reduce(
    (s, h) => s + thb(h.portfolioId, h.marketValue),
    0,
  );
  const pl = value - cost;
  const showPortfolio = !current && portfolios.length > 1;

  // Edit modal: ?edit=<portfolioId>:<symbol>, or ?new=1 to add a holding.
  const editKey = typeof sp.edit === "string" ? sp.edit : null;
  const editing = editKey
    ? all.find((h) => `${h.portfolioId}:${h.symbol}` === editKey)
    : undefined;
  const listHref = `/holdings${current ? `?p=${current}` : ""}`;
  const editHref = (h: (typeof all)[number]) =>
    `/holdings?${current ? `p=${current}&` : ""}edit=${encodeURIComponent(`${h.portfolioId}:${h.symbol}`)}`;

  // Cash card: portfolios with any activity (or cash already entered).
  const cashPortfolios = portfolios.filter(
    (p) =>
      (!current || p.id === current) &&
      (p.cashBalance !== null ||
        cashflows.some((c) => c.portfolioId === p.id) ||
        all.some((h) => h.portfolioId === p.id)),
  );

  return (
    <>
      <PageHeader
        emoji="💼"
        title="หลักทรัพย์ที่ถือ"
        subtitle="หุ้นและเหรียญที่ถืออยู่ตอนนี้ กด ✏️ เพื่อใส่จำนวนและต้นทุนเฉลี่ยให้ตรงกับแอปโบรก"
      >
        <div className="flex flex-wrap items-center gap-3">
          <PortfolioTabs
            portfolios={portfolios}
            current={current}
            basePath="/holdings"
          />
          <NewButton
            basePath="/holdings"
            href={`/holdings?new=1${current ? `&p=${current}` : ""}`}
            label="เพิ่มหุ้น"
          />
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:grid-cols-3">
        <Stat emoji="🧮" label="ต้นทุนรวม (฿)" value={fmt(cost)} />
        <Stat emoji="🏷️" label="มูลค่าตามราคาตลาด (฿)" value={fmt(value)} />
        <Stat
          emoji={pl >= 0 ? "🚀" : "📉"}
          label="กำไร/ขาดทุน (฿)"
          value={fmtSigned(pl)}
          tone={toneClass(pl)}
          hint={cost > 0 ? fmtPct((pl / cost) * 100) : undefined}
        />
      </div>

      <Card
        title={`${holdings.length} รายการ`}
        icon={<Briefcase className="size-5" />}
        className="mb-4"
        action={
          <form
            action={refreshPricesAction}
            className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted"
          >
            <input type="hidden" name="back" value={listHref} />
            {manualPrice.length ? (
              <span title="หาราคาอัตโนมัติไม่ได้ ใช้ราคาที่ใส่เอง (กด ✏️ เพื่อแก้)">
                ✍️ ราคาใส่เอง: {manualPrice.join(", ")}
              </span>
            ) : null}
            {lastPriceUpdate ? (
              <span>ราคาล่าสุดอัปเดต {timeFmt.format(lastPriceUpdate)} น.</span>
            ) : null}
            <button
              type="submit"
              className="btn-ghost px-2.5 py-1 text-xs"
              title="ดึงราคาล่าสุดเดี๋ยวนี้ (Yahoo Finance / Bitkub · ล่าช้าประมาณ 15 นาที)"
            >
              🔄 อัปเดตราคา
            </button>
          </form>
        }
      >
        <MobileList
          empty={
            holdings.length === 0
              ? "🧺 ยังไม่มีหุ้น กด “เพิ่มหุ้น” แล้วใส่ตามแอปโบรก"
              : null
          }
        >
          {holdings.map((h) => {
            const p = portById.get(h.portfolioId);
            const ccy = p?.currency ?? "THB";
            return (
              <MobileItem
                key={`${h.portfolioId}:${h.symbol}`}
                href={editHref(h)}
                icon={ASSET_LABEL[h.assetType].emoji}
                title={h.symbol}
                subtitle={`${fmtQty(h.quantity)} หุ้น · ทุน ${fmtPrice(h.avgCost)}${h.marketPrice === null ? "" : ` · ราคา ${fmtPrice(h.marketPrice)}`}${showPortfolio && p ? ` · ${portfolioEmoji(p)}` : ""}`}
                amount={<Money value={h.marketValue} currency={ccy} always />}
                meta={
                  h.marketPrice === null ? (
                    "ใส่ราคาล่าสุด"
                  ) : (
                    <span className={toneClass(h.unrealized)}>
                      {fmtSigned(h.unrealized)} ({fmtPct(h.unrealizedPct)})
                    </span>
                  )
                }
              />
            );
          })}
          {holdings.length > 1 ? (
            <li className="flex items-center justify-between gap-3 px-1 py-3 font-semibold">
              <span>รวม (฿)</span>
              <span className="text-right tabular-nums">
                {fmt(value)}
                <span className={`block text-xs ${toneClass(pl)}`}>
                  {fmtSigned(pl)}
                  {cost > 0 ? ` (${fmtPct((pl / cost) * 100)})` : ""}
                </span>
              </span>
            </li>
          ) : null}
        </MobileList>
        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>หุ้น / เหรียญ</th>
                {showPortfolio ? <th>พอร์ต</th> : null}
                <th className="num">จำนวน</th>
                <th className="num">ต้นทุนเฉลี่ย</th>
                <th className="num">ราคาล่าสุด</th>
                <th className="num">ต้นทุนรวม</th>
                <th className="num">มูลค่า</th>
                <th className="num">กำไร/ขาดทุน</th>
                <th className="num">ซื้อ-ขายล่าสุด</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holdings.length === 0 ? (
                <EmptyRow
                  cols={10}
                  emoji="🧺"
                  text="ยังไม่มีหุ้น กด “เพิ่มหุ้น” แล้วใส่ตามแอปโบรก"
                />
              ) : null}
              {holdings.map((h) => {
                const ccy = portById.get(h.portfolioId)?.currency ?? "THB";
                const p = portById.get(h.portfolioId);
                const holdingKey = `${h.portfolioId}:${h.symbol}`;
                return (
                  <tr key={holdingKey}>
                    <td>
                      <span className="flex items-center gap-2">
                        {historyByHolding.has(holdingKey) ||
                        dividendsByHolding.has(holdingKey) ? (
                          <SymbolHistory
                            symbol={h.symbol}
                            portfolioName={p?.name ?? ""}
                            currency={ccy}
                            trades={historyByHolding.get(holdingKey) ?? []}
                            dividends={dividendsByHolding.get(holdingKey) ?? []}
                          />
                        ) : (
                          <span className="font-semibold">{h.symbol}</span>
                        )}
                        <AssetBadge type={h.assetType} />
                      </span>
                    </td>
                    {showPortfolio ? (
                      <td data-label="พอร์ต" data-wide>
                        {p ? portfolioEmoji(p) : ""} {p?.name}
                      </td>
                    ) : null}
                    <td className="num" data-label="จำนวน">
                      {fmtQty(h.quantity)}
                    </td>
                    <td className="num" data-label="ต้นทุนเฉลี่ย">
                      {fmtPrice(h.avgCost)}
                    </td>
                    <td className="num" data-label="ราคาล่าสุด">
                      {h.marketPrice === null ? (
                        <span className="text-muted">-</span>
                      ) : (
                        fmtPrice(h.marketPrice)
                      )}
                    </td>
                    <td className="num" data-label="ต้นทุนรวม">
                      <Money value={h.costBasis} currency={ccy} always />
                    </td>
                    <td className="num font-medium" data-label="มูลค่า">
                      <Money value={h.marketValue} currency={ccy} always />
                    </td>
                    <td
                      className={`num font-semibold ${toneClass(h.unrealized)}`}
                      data-label="กำไร/ขาดทุน"
                    >
                      {h.marketPrice === null ? (
                        <span className="font-normal text-muted">
                          ใส่ราคาล่าสุด
                        </span>
                      ) : (
                        <>
                          {fmtSigned(h.unrealized)}{" "}
                          <span className="text-xs">
                            ({fmtPct(h.unrealizedPct)})
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num text-muted">
                      {fmtDate(
                        lastTradeDate.get(`${h.portfolioId}:${h.symbol}`) ??
                          null,
                      )}
                    </td>
                    <td>
                      <div className="row-actions flex justify-end">
                        <Link
                          href={editHref(h)}
                          scroll={false}
                          className="icon-btn"
                          title="แก้ไข"
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">แก้ไข</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {holdings.length > 1 ? (
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2.5">รวม (฿)</td>
                  {showPortfolio ? <td /> : null}
                  <td />
                  <td />
                  <td />
                  <td className="num px-3 py-2.5" data-label="ต้นทุนรวม">
                    <Money value={cost} currency={BASE_CURRENCY} always />
                  </td>
                  <td className="num px-3 py-2.5" data-label="มูลค่า">
                    <Money value={value} currency={BASE_CURRENCY} always />
                  </td>
                  <td
                    className={`num px-3 py-2.5 ${toneClass(pl)}`}
                    data-label="กำไร/ขาดทุน"
                  >
                    {fmtSigned(pl)}{" "}
                    {cost > 0 ? (
                      <span className="text-xs">
                        ({fmtPct((pl / cost) * 100)})
                      </span>
                    ) : null}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <Card
        title="เงินสดในโบรก"
        icon={<Banknote className="size-5" />}
        action={
          <span className="text-xs text-muted">
            ดูยอดจากแอปโบรก แล้วใส่ที่นี่
          </span>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {cashPortfolios.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 ${p.cashBalance === null ? "border-amber-500/40 bg-warn-soft" : "border-line bg-surface-2"}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">
                  {portfolioEmoji(p)} {p.name}
                </p>
                <span className="text-xs text-muted">
                  {p.cashBalance === null
                    ? "⚠️ ยังไม่ได้ใส่"
                    : `อัปเดต ${fmtDate(p.cashUpdatedAt?.slice(0, 10) ?? null)}`}
                </span>
              </div>
              <ActionForm
                action={saveCashBalanceAction}
                submitLabel="บันทึก"
                className="flex items-center gap-2 [&_.btn-primary]:px-3 [&_.btn-primary]:py-1.5"
              >
                <input type="hidden" name="portfolioId" value={p.id} />
                <input
                  name="cash"
                  inputMode="decimal"
                  defaultValue={p.cashBalance ?? ""}
                  placeholder={`เงินสด (${p.currency})`}
                  className="input flex-1 py-1.5"
                />
              </ActionForm>
            </div>
          ))}
        </div>
      </Card>

      <FormModal
        open={!!editing || sp.new === "1"}
        emoji="💼"
        title={editing ? `แก้ไข ${editing.symbol}` : "เพิ่มหุ้น / เหรียญ"}
        closeHref={listHref}
      >
        <p className="mb-4 rounded-xl bg-subtle px-3 py-2 text-sm text-muted">
          💡 ใส่จำนวนและต้นทุนเฉลี่ยตามที่แอปโบรกแสดง ถ้าซื้อหรือขายเพิ่มทีหลัง
          ให้บันทึกในหน้า ซื้อ-ขาย แอปจะคำนวณต่อให้เอง
        </p>
        <ActionForm
          key={editKey ?? "new"}
          action={savePositionAction}
          cancelHref={listHref}
          submitLabel="บันทึก"
        >
          {editing ? (
            <>
              <input
                type="hidden"
                name="portfolioId"
                value={editing.portfolioId}
              />
              <input type="hidden" name="symbol" value={editing.symbol} />
            </>
          ) : (
            <>
              <Field label="พอร์ต">
                <PortfolioSelect
                  portfolios={portfolios}
                  defaultValue={current ?? undefined}
                />
              </Field>
              <Field label="ชื่อย่อ (Symbol)">
                <input
                  name="symbol"
                  placeholder="เช่น JAS, VOO, BTC"
                  className="input uppercase"
                  required
                />
              </Field>
            </>
          )}
          <Field label="ชนิด">
            <select
              name="assetType"
              defaultValue={editing?.assetType ?? "stock"}
              className="input"
            >
              <option value="stock">🏢 หุ้น</option>
              <option value="etf">🧺 ETF</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </Field>
          <Field label="จำนวน">
            <input
              name="quantity"
              inputMode="decimal"
              defaultValue={editing?.quantity}
              className="input"
              required
            />
          </Field>
          <Field label="ต้นทุนเฉลี่ย (Avg Cost)">
            <input
              name="avgCost"
              inputMode="decimal"
              defaultValue={editing ? Number(editing.avgCost.toFixed(6)) : ""}
              className="input"
              required
            />
          </Field>
          <Field label="ราคาล่าสุด (Mkt Price)">
            <input
              name="price"
              inputMode="decimal"
              defaultValue={editing?.marketPrice ?? ""}
              placeholder="ไม่บังคับ"
              className="input"
            />
          </Field>
        </ActionForm>
      </FormModal>
    </>
  );
}
