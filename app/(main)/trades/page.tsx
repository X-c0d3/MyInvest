import { BarChart3, ChartPie, ListOrdered } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listFxRates,
  listKnownSymbols,
  listPortfolios,
  listPositions,
  listPrices,
  listTrades,
} from "@/lib/data";
import { buildFx, computePositions } from "@/lib/calc";
import { saveTradeAction } from "@/app/actions";
import {
  fmt,
  fmtDate,
  fmtPrice,
  fmtQty,
  fmtSigned,
  toneClass,
  portfolioEmoji,
  ASSET_LABEL,
  BASE_CURRENCY,
  seriesColor,
} from "@/lib/format";
import { PortfolioDonut, type DonutSlice } from "@/components/portfolio-donut";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import {
  AssetBadge,
  Card,
  EmptyRow,
  Field,
  Money,
  PageHeader,
  PortfolioSelect,
  PortfolioTabs,
  RowActions,
  pickEdit,
  pickPortfolio,
  today,
  NewButton,
  MobileItem,
  MobileList,
  ModalDelete,
  Stat,
} from "@/components/ui";
import { ChartTabs } from "@/components/chart-tabs";
import { SymbolSelect } from "@/components/symbol-select";
import { TradeChart, type TradeColumn } from "@/components/trade-chart";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function TradesPage({
  searchParams,
}: PageProps<"/trades">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const current = pickPortfolio(portfolios, sp.p);
  const all = listTrades(user.id);
  const rows = current ? all.filter((t) => t.portfolioId === current) : all;
  const editing = all.find((t) => t.id === pickEdit(sp.edit));
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  const { realized, skipped } = computePositions(
    all,
    listPrices(user.id),
    listPositions(user.id),
  );
  const pnlByTrade = new Map(realized.map((r) => [r.tradeId, r.pnl]));
  const symbolsByPortfolio: Record<number, string[]> = {};
  for (const k of listKnownSymbols(user.id))
    (symbolsByPortfolio[k.portfolioId] ??= []).push(k.symbol);
  // ---- chart + totals (THB) ----
  const fx = buildFx(portfolios, listCashflows(user.id), listFxRates(user.id));
  const tradeThb = (t: (typeof all)[number]) =>
    (t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee)) *
    fx.rateOf(t.portfolioId);
  const pnlThb = (t: (typeof all)[number]) =>
    (pnlByTrade.get(t.id) ?? 0) * fx.rateOf(t.portfolioId);
  const totalBuy = rows
    .filter((t) => t.side === "buy")
    .reduce((s, t) => s + tradeThb(t), 0);
  const totalSell = rows
    .filter((t) => t.side === "sell")
    .reduce((s, t) => s + tradeThb(t), 0);
  const totalRealized = rows.reduce((s, t) => s + pnlThb(t), 0);
  const sellCount = rows.filter((t) => t.side === "sell").length;

  const column = (
    key: string,
    label: string,
    title: string,
    inPeriod: (d: string) => boolean,
  ): TradeColumn => {
    const xs = rows.filter((t) => inPeriod(t.date));
    return {
      key,
      label,
      title,
      buy: xs
        .filter((t) => t.side === "buy")
        .reduce((s, t) => s + tradeThb(t), 0),
      sell: xs
        .filter((t) => t.side === "sell")
        .reduce((s, t) => s + tradeThb(t), 0),
      realized: xs.reduce((s, t) => s + pnlThb(t), 0),
      count: xs.length,
    };
  };
  // Donut: total trade value (มูลค่ารวม) per symbol in THB, top payers + "อื่นๆ".
  const bySymbolMap = new Map<
    string,
    {
      value: number;
      emoji: string;
      buys: number;
      sells: number;
      qtyIn: number;
      qtyOut: number;
      unit: string;
      /** Value in the portfolio's own currency; currency is null when a symbol spans currencies. */
      native: number;
      currency: string | null;
    }
  >();
  for (const t of rows) {
    const x = bySymbolMap.get(t.symbol) ?? {
      value: 0,
      emoji: ASSET_LABEL[t.assetType].emoji,
      buys: 0,
      sells: 0,
      qtyIn: 0,
      qtyOut: 0,
      unit: t.assetType === "crypto" ? "เหรียญ" : "หุ้น",
      native: 0,
      currency: portById.get(t.portfolioId)?.currency ?? BASE_CURRENCY,
    };
    const ccy = portById.get(t.portfolioId)?.currency ?? BASE_CURRENCY;
    if (x.currency !== ccy) x.currency = null;
    x.native += t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee);
    x.value += tradeThb(t);
    if (t.side === "buy") {
      x.buys += 1;
      x.qtyIn += t.quantity;
    } else {
      x.sells += 1;
      x.qtyOut += t.quantity;
    }
    bySymbolMap.set(t.symbol, x);
  }
  const symbolsRanked = [...bySymbolMap.entries()].sort(
    (a, b) => b[1].value - a[1].value,
  );
  const TOP = 5;
  const symbolSlices: DonutSlice[] = [
    ...symbolsRanked.slice(0, TOP).map(([sym, x], i) => ({
      id: i,
      emoji: x.emoji,
      name: sym,
      value: x.value,
      color: seriesColor(i),
      native:
        x.currency && x.currency !== BASE_CURRENCY
          ? { value: x.native, currency: x.currency }
          : undefined,
      // Volume: shares (or coins) bought minus sold, i.e. what these trades leave you holding.
      sub: `${fmtQty(x.qtyIn - x.qtyOut)} ${x.unit}`,
      info: [
        ["ซื้อ", `${x.buys} ครั้ง · ${fmtQty(x.qtyIn)} ${x.unit}`],
        ["ขาย", `${x.sells} ครั้ง · ${fmtQty(x.qtyOut)} ${x.unit}`],
        ["คงเหลือ", `${fmtQty(x.qtyIn - x.qtyOut)} ${x.unit}`],
      ] as [string, string][],
    })),
    ...(symbolsRanked.length > TOP
      ? [
          {
            id: TOP,
            emoji: "➕",
            name: `อื่นๆ (${symbolsRanked.length - TOP})`,
            value: symbolsRanked
              .slice(TOP)
              .reduce((s, [, x]) => s + x.value, 0),
            color: "var(--muted)",
            info: symbolsRanked
              .slice(TOP)
              .map(([sym, x]) => [sym, fmt(x.value, 0)] as [string, string]),
          },
        ]
      : []),
  ];

  const now = today();
  const thisYear = Number(now.slice(0, 4));
  const firstYear = rows.length
    ? Math.min(...rows.map((t) => Number(t.date.slice(0, 4))))
    : thisYear;
  const yearCols = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => {
    const y = String(firstYear + i);
    return column(y, y, `ปี ${y}`, (d) => d.startsWith(y));
  });
  const monthName = new Intl.DateTimeFormat("th-TH", { month: "short" });
  const monthCols = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(thisYear, Number(now.slice(5, 7)) - 12 + i, 1));
    const ym = d.toISOString().slice(0, 7);
    const name = monthName.format(d);
    return column(ym, name, `${name} ${d.getUTCFullYear()}`, (x) =>
      x.startsWith(ym),
    );
  });

  const defaultPort = portById.get(
    editing?.portfolioId ?? current ?? portfolios[0]?.id ?? 0,
  );

  return (
    <>
      <PageHeader
        emoji="🔁"
        title="ซื้อ-ขาย"
        subtitle="หุ้นไทย ETF หุ้นต่างประเทศ และ Crypto · กำไรที่ขายแล้วคำนวณแบบต้นทุนเฉลี่ย"
      >
        <div className="flex flex-wrap items-center gap-3">
          <PortfolioTabs
            portfolios={portfolios}
            current={current}
            basePath="/trades"
          />
          <NewButton basePath="/trades" current={current} />
        </div>
      </PageHeader>

      <FormModal
        open={!!editing || sp.new === "1"}
        emoji="🔁"
        title={editing ? "แก้ไขรายการซื้อขาย" : "บันทึกการซื้อขาย"}
        closeHref={`/trades${current ? `?p=${current}` : ""}`}
      >
        <ActionForm
          key={editing?.id ?? "new"}
          action={saveTradeAction}
          editId={editing?.id}
          cancelHref={`/trades${current ? `?p=${current}` : ""}`}
        >
          <Field label="พอร์ต">
            <PortfolioSelect
              portfolios={portfolios}
              defaultValue={defaultPort?.id}
            />
          </Field>
          <Field label="ประเภท">
            <select
              name="side"
              defaultValue={editing?.side ?? "buy"}
              className="input"
            >
              <option value="buy">🟢 ซื้อ (BUY)</option>
              <option value="sell">🔴 ขาย (SELL)</option>
            </select>
          </Field>
          <Field label="ชนิดสินทรัพย์">
            <select
              name="assetType"
              defaultValue={
                editing?.assetType ??
                (defaultPort?.kind === "crypto" ? "crypto" : "stock")
              }
              className="input"
            >
              <option value="stock">🏢 หุ้น</option>
              <option value="etf">🧺 ETF</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </Field>
          <Field label="ชื่อย่อ (Symbol)">
            <SymbolSelect
              allowNew
              byPortfolio={symbolsByPortfolio}
              defaultPortfolioId={defaultPort?.id}
              defaultValue={editing?.symbol}
            />
          </Field>
          <Field label="วันที่">
            <input
              name="date"
              type="date"
              defaultValue={editing?.date ?? today()}
              className="input"
              required
            />
          </Field>
          <Field label="จำนวน (หุ้น / หน่วย / เหรียญ)">
            <input
              name="quantity"
              inputMode="decimal"
              defaultValue={editing?.quantity}
              className="input"
              required
            />
          </Field>
          <Field label="ราคาต่อหน่วย (สกุลเงินของพอร์ต)">
            <input
              name="price"
              inputMode="decimal"
              defaultValue={editing?.price}
              className="input"
              required
            />
          </Field>
          <Field label="ค่าธรรมเนียม + VAT">
            <input
              name="fee"
              inputMode="decimal"
              defaultValue={editing?.fee ?? 0}
              className="input"
            />
          </Field>
          <Field label="โบรกเกอร์ / Exchange">
            <input
              name="broker"
              defaultValue={editing?.broker ?? ""}
              placeholder="เช่น Bitkub, Dime, IBKR"
              className="input"
            />
          </Field>
          <Field label="หมายเหตุ" wide>
            <input
              name="note"
              defaultValue={editing?.note ?? ""}
              className="input"
            />
          </Field>
        </ActionForm>
        {editing ? (
          <ModalDelete
            table="trades"
            id={editing.id}
            label={`${editing.side === "buy" ? "ซื้อ" : "ขาย"} ${editing.symbol} วันที่ ${fmtDate(editing.date)}`}
          />
        ) : null}
      </FormModal>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          emoji="🟢"
          label="ซื้อรวม (฿)"
          value={fmt(totalBuy)}
          hint="รวมค่าธรรมเนียม"
        />
        <Stat
          emoji="🔴"
          label="ขายรวม (฿)"
          value={fmt(totalSell)}
          hint="หักค่าธรรมเนียมแล้ว"
        />
        <Stat
          emoji={totalRealized >= 0 ? "🎉" : "📉"}
          label="กำไรที่ขายแล้ว (฿)"
          value={sellCount ? fmtSigned(totalRealized) : "-"}
          tone={sellCount ? toneClass(totalRealized) : ""}
          hint={`จากการขาย ${sellCount} รายการ`}
        />
        <Stat emoji="🧾" label="จำนวนรายการ" value={`${rows.length} รายการ`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <ChartTabs
            title={
              <>
                <BarChart3 className="size-5 text-accent" /> ซื้อ-ขายตามช่วงเวลา
                (฿)
              </>
            }
            tabs={[
              {
                key: "year",
                label: "รายปี",
                content: <TradeChart cols={yearCols} />,
              },
              {
                key: "month",
                label: "12 เดือนล่าสุด",
                content: <TradeChart cols={monthCols} />,
              },
            ]}
          />
        </Card>
        <Card
          title="สัดส่วนมูลค่าตาม Symbol (฿)"
          icon={<ChartPie className="size-5" />}
        >
          <PortfolioDonut slices={symbolSlices} />
        </Card>
      </div>

      <Card title="ประวัติ" icon={<ListOrdered className="size-5" />}>
        <MobileList
          empty={rows.length === 0 ? "🛒 ยังไม่มีรายการซื้อขาย" : null}
        >
          {rows.map((t) => {
            const p = portById.get(t.portfolioId);
            const ccy = p?.currency ?? "THB";
            const pnl = pnlByTrade.get(t.id);
            const total =
              t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee);
            const covered = skipped.has(t.id);
            return (
              <MobileItem
                key={t.id}
                href={`/trades?edit=${t.id}`}
                dim={covered}
                icon={ASSET_LABEL[t.assetType].emoji}
                iconClassName={t.side === "buy" ? "bg-pos-soft" : "bg-neg-soft"}
                title={t.symbol}
                badge={
                  <>
                    <span
                      className={`badge shrink-0 text-[10px] ${t.side === "buy" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                    >
                      {t.side === "buy" ? "BUY" : "SELL"}
                    </span>
                    {covered ? (
                      <span className="badge shrink-0 bg-subtle text-[10px] text-muted">
                        รวมแล้ว
                      </span>
                    ) : null}
                  </>
                }
                subtitle={`${fmtDate(t.date)} · ${fmtQty(t.quantity)} @ ${fmtPrice(t.price)}${p && portfolios.length > 1 ? ` · ${portfolioEmoji(p)}` : ""}`}
                amount={<Money value={total} currency={ccy} />}
                meta={
                  pnl === undefined ? undefined : (
                    <span className={toneClass(pnl)}>
                      {pnl >= 0 ? "🎉 " : ""}
                      {fmtSigned(pnl)}
                    </span>
                  )
                }
              />
            );
          })}
        </MobileList>
        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>Symbol</th>
                <th>ชนิด</th>
                <th>รายการ</th>
                <th>พอร์ต</th>
                <th className="num">จำนวน</th>
                <th className="num">ราคา</th>
                <th className="num">ค่าธรรมเนียม</th>
                <th className="num">มูลค่ารวม</th>
                <th className="num">กำไรที่ขายแล้ว</th>
                <th>โบรกเกอร์</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={12} emoji="🛒" text="ยังไม่มีรายการซื้อขาย" />
              ) : null}
              {rows.map((t) => {
                const p = portById.get(t.portfolioId);
                const ccy = p?.currency ?? "THB";
                const pnl = pnlByTrade.get(t.id);
                const total =
                  t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee);
                return (
                  <tr
                    key={t.id}
                    className={skipped.has(t.id) ? "text-muted" : undefined}
                  >
                    <td data-label="วันที่">{fmtDate(t.date)}</td>
                    <td className="font-semibold" data-title>
                      {t.symbol}
                    </td>
                    <td data-label="ชนิด">
                      <AssetBadge type={t.assetType} />
                    </td>
                    <td data-label="รายการ">
                      <span className="flex flex-col items-start gap-0.5">
                        <span
                          className={`badge ${t.side === "buy" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                        >
                          {t.side === "buy" ? "BUY" : "SELL"}
                        </span>
                        {skipped.has(t.id) ? (
                          <span
                            className="badge bg-subtle text-[10px] text-muted"
                            title="รวมอยู่ในยอดหุ้นที่ปรับให้ตรงกับโบรกแล้ว (หน้าหลักทรัพย์ที่ถือ) จึงไม่นับซ้ำ"
                          >
                            รวมแล้ว
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td data-label="พอร์ต">
                      {p ? portfolioEmoji(p) : ""} {p?.name}
                    </td>
                    <td className="num" data-label="จำนวน">
                      {fmtQty(t.quantity)}
                    </td>
                    <td className="num" data-label="ราคา">
                      {fmtPrice(t.price)}
                    </td>
                    <td className="num text-muted" data-label="ค่าธรรมเนียม">
                      {fmtPrice(t.fee)}
                    </td>
                    <td className="num" data-label="มูลค่ารวม">
                      <Money value={total} currency={ccy} />
                    </td>
                    <td
                      className={`num ${pnl === undefined ? "text-muted" : toneClass(pnl)}`}
                      data-label="กำไรที่ขายแล้ว"
                    >
                      {pnl === undefined ? (
                        "-"
                      ) : (
                        <>
                          {pnl >= 0 ? "🎉 " : ""}
                          {fmtSigned(pnl)}
                        </>
                      )}
                    </td>
                    <td data-label="โบรกเกอร์">
                      <span
                        className="block max-w-32 truncate"
                        title={t.broker}
                      >
                        {t.broker}
                      </span>
                    </td>
                    <td>
                      <RowActions
                        href={`/trades?edit=${t.id}`}
                        table="trades"
                        id={t.id}
                        label={`${t.side === "buy" ? "ซื้อ" : "ขาย"} ${t.symbol} วันที่ ${fmtDate(t.date)}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
