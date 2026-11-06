import { CalendarRange, ListOrdered, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listDividends,
  listFxRates,
  listPortfolios,
} from "@/lib/data";
import {
  buildFx,
  cashflowThb,
  dividendGross,
  dividendNet,
  dividendTax,
  yearOf,
  yearlySummary,
} from "@/lib/calc";
import { saveDividendAction } from "@/app/actions";
import {
  fmt,
  fmtDate,
  fmtPct,
  fmtQty,
  portfolioEmoji,
  seriesColor,
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import { DividendChart } from "@/components/dividend-chart";
import { ChartTabs } from "@/components/chart-tabs";
import {
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
  Stat,
  today,
  NewButton,
  MobileItem,
  MobileList,
  ModalDelete,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function DividendsPage({
  searchParams,
}: PageProps<"/dividends">) {
  const user = await requireUser();
  const sp = await searchParams;
  const allPortfolios = listPortfolios(user.id);
  const portfolios = allPortfolios.filter((p) => p.kind === "stock");
  const current = pickPortfolio(portfolios, sp.p);
  const all = listDividends(user.id);
  const rows = current ? all.filter((d) => d.portfolioId === current) : all;
  const editing = all.find((d) => d.id === pickEdit(sp.edit));
  const portById = new Map(allPortfolios.map((p) => [p.id, p]));

  const allCashflows = listCashflows(user.id);
  const fx = buildFx(allPortfolios, allCashflows, listFxRates(user.id));
  const cashflows = current
    ? allCashflows.filter((c) => c.portfolioId === current)
    : allCashflows;
  const years = yearlySummary(cashflows, rows, [], fx).filter(
    (y) => y.dividendNet > 0,
  );
  const totalNet = rows.reduce(
    (s, d) => s + dividendNet(d) * fx.rateOf(d.portfolioId),
    0,
  );
  // Dividends the broker paid out to the bank and the owner moved back into a portfolio.
  const reinvested = cashflows
    .filter((c) => c.type === "deposit" && c.source === "dividend")
    .reduce((s, c) => s + cashflowThb(c, fx), 0);
  // Current capital (deposits − withdrawals) of the portfolios that pay these dividends,
  // the base the owner's sheet uses for "คิดเป็น %" on every year.
  const payingIds = new Set(rows.map((d) => d.portfolioId));
  const capitalBase = cashflows
    .filter((c) => payingIds.has(c.portfolioId))
    .reduce(
      (s, c) => s + (c.type === "deposit" ? 1 : -1) * cashflowThb(c, fx),
      0,
    );
  const totalTax = rows.reduce(
    (s, d) => s + dividendTax(d) * fx.rateOf(d.portfolioId),
    0,
  );
  const best = years.reduce<(typeof years)[number] | null>(
    (a, b) => (!a || b.dividendNet > a.dividendNet ? b : a),
    null,
  );
  const latest = years.at(-1);
  const prevYear = years.at(-2);
  const latestChange =
    latest && prevYear && prevYear.dividendNet > 0
      ? ((latest.dividendNet - prevYear.dividendNet) / prevYear.dividendNet) *
        100
      : null;
  const avgPerYear = years.length
    ? years.reduce((s, y) => s + y.dividendNet, 0) /
      (years.at(-1)!.year - years[0].year + 1)
    : 0;

  const symbolTotals = new Map<
    string,
    { symbol: string; net: number; count: number }
  >();
  for (const d of rows) {
    const x = symbolTotals.get(d.symbol) ?? {
      symbol: d.symbol,
      net: 0,
      count: 0,
    };
    x.net += dividendNet(d) * fx.rateOf(d.portfolioId);
    x.count += 1;
    symbolTotals.set(d.symbol, x);
  }
  const bySymbol = [...symbolTotals.values()].sort((a, b) => b.net - a.net);

  // Chart segments: the top payers keep a fixed color by overall rank; the rest fold into "อื่นๆ".
  const TOP_STACKS = 5;
  const topSymbols = bySymbol.slice(0, TOP_STACKS).map((x) => x.symbol);
  const stacks = [
    ...topSymbols.map((sym, i) => ({
      key: sym,
      label: sym,
      color: seriesColor(i),
    })),
    ...(bySymbol.length > TOP_STACKS
      ? [{ key: "__other", label: "อื่นๆ", color: "var(--muted)" }]
      : []),
  ];
  const stackParts: Record<number, Record<string, number>> = {};
  for (const d of rows) {
    const y = yearOf(d.paidDate);
    const key = topSymbols.includes(d.symbol) ? d.symbol : "__other";
    const bucket = (stackParts[y] ??= {});
    bucket[key] =
      (bucket[key] ?? 0) + dividendNet(d) * fx.rateOf(d.portfolioId);
  }

  return (
    <>
      <PageHeader
        emoji="🎁"
        title="ปันผล"
        subtitle="ใส่จำนวนหุ้นและปันผลต่อหุ้น ระบบคำนวณยอดรวม ภาษี และยอดสุทธิให้"
      >
        <div className="flex flex-wrap items-center gap-3">
          <PortfolioTabs
            portfolios={portfolios}
            current={current}
            basePath="/dividends"
          />
          <NewButton basePath="/dividends" current={current} />
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          emoji="💰"
          label="ปันผลสุทธิสะสม (฿)"
          value={fmt(totalNet)}
          tone="text-pos"
          hint={
            capitalBase > 0 ? (
              <>
                <span className="font-semibold text-pos">
                  {fmtPct((totalNet / capitalBase) * 100)}
                </span>{" "}
                ของเงินต้นปัจจุบัน
              </>
            ) : undefined
          }
        />
        <Stat
          emoji="🧾"
          label="ภาษีหัก ณ ที่จ่ายสะสม (฿)"
          value={fmt(totalTax)}
          hint="หุ้นไทยใช้ขอคืนภาษีได้"
        />
        <Stat
          emoji="🔁"
          label="นำกลับมาลงทุนแล้ว (฿)"
          value={fmt(reinvested)}
          hint={
            totalNet > 0
              ? `${fmtPct((reinvested / totalNet) * 100)} ของปันผลทั้งหมด · บันทึกเป็นเงินฝาก "ปันผลนำกลับ"`
              : undefined
          }
        />
        <Stat
          emoji="🔔"
          label="จำนวนครั้งที่ได้รับ"
          value={`${rows.length} ครั้ง`}
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <ChartTabs
            title={
              <>
                <CalendarRange className="size-5 text-accent" /> ปันผลรายปี (฿)
              </>
            }
            action={
              best ? (
                <span className="badge bg-accent-soft text-accent">
                  🏆 สูงสุดปี {best.year}: {fmt(best.dividendNet, 0)}
                </span>
              ) : null
            }
            tabs={[
              {
                key: "bar",
                label: "📊 แท่ง (แยกหุ้น)",
                content: (
                  <DividendChart
                    years={years}
                    capital={capitalBase}
                    stacks={stacks}
                    parts={stackParts}
                  />
                ),
              },
              {
                key: "line",
                label: "📈 เส้น (รวมต่อปี)",
                content: (
                  <DividendChart
                    view="line"
                    years={years}
                    capital={capitalBase}
                    stacks={stacks}
                    parts={stackParts}
                  />
                ),
              },
            ]}
          >
            {years.length > 0 ? (
              <div className="mb-5 grid grid-cols-3 gap-3">
                {[
                  ["📅", "เฉลี่ยต่อปี", fmt(avgPerYear, 0)],
                  ["🗓️", `ปี ${latest!.year}`, fmt(latest!.dividendNet, 0)],
                  [
                    latestChange === null
                      ? "➖"
                      : latestChange >= 0
                        ? "📈"
                        : "📉",
                    "เทียบปีก่อน",
                    latestChange === null
                      ? "-"
                      : `${latestChange >= 0 ? "+" : "−"}${fmtPct(Math.abs(latestChange))}`,
                  ],
                ].map(([emoji, label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl bg-surface-2 px-3 py-2.5"
                  >
                    <p className="text-xs text-muted">
                      {emoji} {label}
                    </p>
                    <p
                      className={`mt-0.5 font-bold tabular-nums ${
                        label === "เทียบปีก่อน" && latestChange !== null
                          ? latestChange >= 0
                            ? "text-pos"
                            : "text-neg"
                          : ""
                      }`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </ChartTabs>
        </Card>

        <Card
          title="หุ้นที่จ่ายปันผลให้มากที่สุด"
          icon={<Trophy className="size-5" />}
        >
          {bySymbol.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              🌱 ยังไม่มีข้อมูล
            </p>
          ) : null}
          <ol className="space-y-3.5">
            {bySymbol.slice(0, 6).map((x, i) => (
              <li key={x.symbol} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-base">
                  {["🥇", "🥈", "🥉"][i] ?? (
                    <span className="text-xs font-semibold text-muted">
                      {i + 1}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{x.symbol}</span>
                    <span className="tabular-nums">
                      {fmt(x.net, 0)}{" "}
                      <span className="text-xs text-muted">
                        · {x.count} ครั้ง
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(x.net / bySymbol[0].net) * 100}%`,
                        background:
                          i < TOP_STACKS ? seriesColor(i) : "var(--muted)",
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {bySymbol.length > 0 ? (
            <p className="mt-5 text-xs text-muted">
              💡 {bySymbol[0].symbol} คิดเป็น{" "}
              {fmtPct((bySymbol[0].net / totalNet) * 100)} ของปันผลทั้งหมด
            </p>
          ) : null}
        </Card>
      </div>

      <FormModal
        open={!!editing || sp.new === "1"}
        emoji="🎁"
        title={editing ? "แก้ไขรายการปันผล" : "บันทึกปันผล"}
        closeHref={`/dividends${current ? `?p=${current}` : ""}`}
      >
        {portfolios.length === 0 ? (
          <p className="text-sm text-muted">
            📂 ยังไม่มีพอร์ตหุ้น เพิ่มได้ที่หน้า พอร์ต & ค่าเงิน
          </p>
        ) : (
          <ActionForm
            key={editing?.id ?? "new"}
            action={saveDividendAction}
            editId={editing?.id}
            cancelHref={`/dividends${current ? `?p=${current}` : ""}`}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="พอร์ต">
              <PortfolioSelect
                portfolios={portfolios}
                defaultValue={editing?.portfolioId ?? current ?? undefined}
              />
            </Field>
            <Field label="หุ้น / ETF">
              <input
                name="symbol"
                defaultValue={editing?.symbol}
                placeholder="เช่น SYNEX, VOO"
                className="input uppercase"
                required
              />
            </Field>
            <Field label="จำนวนหุ้น">
              <input
                name="shares"
                inputMode="decimal"
                defaultValue={editing?.shares}
                className="input"
                required
              />
            </Field>
            <Field label="ปันผลต่อหุ้น">
              <input
                name="dps"
                inputMode="decimal"
                defaultValue={editing?.dps}
                className="input"
                required
              />
            </Field>
            <Field label="วัน XD">
              <input
                name="xdDate"
                type="date"
                defaultValue={editing?.xdDate ?? ""}
                className="input"
              />
            </Field>
            <Field label="วันจ่ายปันผล">
              <input
                name="paidDate"
                type="date"
                defaultValue={editing?.paidDate ?? today()}
                className="input"
                required
              />
            </Field>
            <Field
              label="ภาษีหัก ณ ที่จ่าย (%)"
              hint="หุ้นไทย 10% · หุ้น US 15% (W-8BEN)"
            >
              <input
                name="taxRate"
                inputMode="decimal"
                defaultValue={editing?.taxRate ?? 10}
                className="input"
              />
            </Field>
            <Field label="หมายเหตุ">
              <input
                name="note"
                defaultValue={editing?.note ?? ""}
                className="input"
              />
            </Field>
          </ActionForm>
        )}
        {editing ? (
          <ModalDelete
            table="dividends"
            id={editing.id}
            label={`ปันผล ${editing.symbol} วันที่ ${fmtDate(editing.paidDate)}`}
          />
        ) : null}
      </FormModal>

      <Card title="ประวัติ" icon={<ListOrdered className="size-5" />}>
        <MobileList empty={rows.length === 0 ? "🎁 ยังไม่มีรายการปันผล" : null}>
          {rows.map((d) => {
            const p = portById.get(d.portfolioId);
            const ccy = p?.currency ?? "THB";
            return (
              <MobileItem
                key={d.id}
                href={`/dividends?edit=${d.id}`}
                icon="🎁"
                iconClassName="bg-accent-soft"
                title={d.symbol}
                subtitle={`จ่าย ${fmtDate(d.paidDate)} · ${fmtQty(d.shares)} หุ้น × ${fmt(d.dps, 4)}${p && portfolios.length > 1 ? ` · ${portfolioEmoji(p)}` : ""}`}
                amount={<Money value={dividendNet(d)} currency={ccy} />}
                amountClassName="text-pos"
                meta={`ภาษี ${fmt(dividendTax(d))}`}
              />
            );
          })}
        </MobileList>
        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>หุ้น</th>
                <th>พอร์ต</th>
                <th className="num">จำนวนหุ้น</th>
                <th>วัน XD</th>
                <th>วันจ่าย</th>
                <th className="num">ปันผล/หุ้น</th>
                <th className="num">รวม</th>
                <th className="num">ภาษี</th>
                <th className="num">สุทธิ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={10} emoji="🎁" text="ยังไม่มีรายการปันผล" />
              ) : null}
              {rows.map((d) => {
                const ccy = portById.get(d.portfolioId)?.currency ?? "THB";
                return (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.symbol}</td>
                    <td data-label="พอร์ต">
                      {portfolioEmoji(portById.get(d.portfolioId)!)}{" "}
                      {portById.get(d.portfolioId)?.name}
                    </td>
                    <td className="num" data-label="จำนวนหุ้น">
                      {fmtQty(d.shares)}
                    </td>
                    <td data-label="วัน XD">{fmtDate(d.xdDate)}</td>
                    <td data-label="วันจ่าย">{fmtDate(d.paidDate)}</td>
                    <td className="num" data-label="ปันผล/หุ้น">
                      {fmt(d.dps, 4)}
                    </td>
                    <td className="num" data-label="รวม">
                      <Money value={dividendGross(d)} currency={ccy} />
                    </td>
                    <td className="num text-muted" data-label="ภาษี">
                      {fmt(dividendTax(d))}{" "}
                      <span className="text-xs">
                        ({Number(d.taxRate.toFixed(2))}%)
                      </span>
                    </td>
                    <td
                      className="num font-semibold text-pos"
                      data-label="สุทธิ"
                    >
                      <Money value={dividendNet(d)} currency={ccy} />
                    </td>
                    <td>
                      <RowActions
                        href={`/dividends?edit=${d.id}`}
                        table="dividends"
                        id={d.id}
                        label={`ปันผล ${d.symbol} วันที่ ${fmtDate(d.paidDate)}`}
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
