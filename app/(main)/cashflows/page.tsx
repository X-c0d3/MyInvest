import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Landmark,
  ListOrdered,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listFxRates,
  listPortfolios,
  type Cashflow,
} from "@/lib/data";
import { buildFx, cashflowThb, isFreshMoney, yearOf } from "@/lib/calc";
import { saveCashflowAction } from "@/app/actions";
import {
  CASH_SOURCE_LABEL,
  fmt,
  fmtDate,
  fmtPct,
  fmtSigned,
  portfolioEmoji,
  seriesColor,
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import {
  CashflowChart,
  type FlowSeries,
  type FlowYear,
} from "@/components/cashflow-chart";
import {
  Card,
  Field,
  Money,
  NewButton,
  PageHeader,
  PortfolioSelect,
  RowActions,
  pickEdit,
  pickPortfolio,
  Stat,
  today,
  MobileItem,
  MobileList,
  ModalDelete,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

/** History filter kinds: a deposit's source, or a withdrawal. */
const KINDS = {
  new: `${CASH_SOURCE_LABEL.new.emoji} ${CASH_SOURCE_LABEL.new.label}`,
  dividend: `${CASH_SOURCE_LABEL.dividend.emoji} ${CASH_SOURCE_LABEL.dividend.label}`,
  realized: `${CASH_SOURCE_LABEL.realized.emoji} ${CASH_SOURCE_LABEL.realized.label}`,
  withdraw: "⬆️ ถอน",
} as const;
type Kind = keyof typeof KINDS;
const kindOf = (c: Cashflow): Kind =>
  c.type === "withdraw" ? "withdraw" : c.source;

export default async function CashflowsPage({
  searchParams,
}: PageProps<"/cashflows">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const all = listCashflows(user.id);
  const editing = all.find((c) => c.id === pickEdit(sp.edit));
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  const fx = buildFx(portfolios, all, listFxRates(user.id));
  const hasForeign = portfolios.some((p) => p.currency !== "THB");
  const thb = (c: Cashflow) => cashflowThb(c, fx);
  const total = (xs: Cashflow[]) => xs.reduce((s, c) => s + thb(c), 0);

  // History filters live in the URL: ?h=<portfolio id> and ?t=<kind>.
  const filterPort = pickPortfolio(portfolios, sp.h);
  const filterKind =
    (Object.keys(KINDS) as Kind[]).find((k) => k === sp.t) ?? null;
  const query = (
    over: { h?: number | null; t?: Kind | null; extra?: string } = {},
  ) => {
    const h = "h" in over ? over.h : filterPort;
    const t = "t" in over ? over.t : filterKind;
    const qs = [h ? `h=${h}` : "", t ? `t=${t}` : "", over.extra ?? ""]
      .filter(Boolean)
      .join("&");
    return `/cashflows${qs ? `?${qs}` : ""}`;
  };
  const listHref = query();

  // ---- totals (all portfolios) ----
  const byKind = (k: Kind) => all.filter((c) => kindOf(c) === k);
  const fresh = total(byKind("new"));
  const reinvestDividend = total(byKind("dividend"));
  const reinvestRealized = total(byKind("realized"));
  const withdraw = total(byKind("withdraw"));

  // ---- per portfolio; colors follow the portfolio's position among all portfolios ----
  const perPort = portfolios
    .map((p, i) => {
      const rows = all.filter((c) => c.portfolioId === p.id);
      const f = total(rows.filter((c) => kindOf(c) === "new"));
      const r = total(
        rows.filter((c) => c.type === "deposit" && c.source !== "new"),
      );
      const w = total(rows.filter((c) => c.type === "withdraw"));
      return {
        p,
        color: seriesColor(i),
        count: rows.length,
        fresh: f,
        reinvest: r,
        withdraw: w,
        /** เงินเข้าพอร์ตสุทธิ: everything moved in minus withdrawals. */
        netIn: f + r - w,
        /** The same net amount in the portfolio's own currency (e.g. USD), for non-THB portfolios. */
        netNative:
          p.currency === "THB"
            ? null
            : rows.reduce(
                (t, c) => t + (c.type === "deposit" ? c.amount : -c.amount),
                0,
              ),
      };
    })
    .filter((x) => x.count > 0);
  const colorOf = new Map(perPort.map((x) => [x.p.id, x.color]));
  const netInTotal = perPort.reduce((s, x) => s + x.netIn, 0);

  // ---- chart data ----
  const series: FlowSeries[] = perPort.map((x) => ({
    id: x.p.id,
    name: x.p.name,
    emoji: portfolioEmoji(x.p),
    color: x.color,
  }));
  const yearMap = new Map<number, FlowYear>();
  for (const c of all) {
    const year = yearOf(c.date);
    const y = yearMap.get(year) ?? { year, capital: 0, parts: {} };
    const part = (y.parts[c.portfolioId] ??= {
      fresh: 0,
      reinvest: 0,
      withdraw: 0,
    });
    const k = kindOf(c);
    part[k === "withdraw" ? "withdraw" : k === "new" ? "fresh" : "reinvest"] +=
      thb(c);
    yearMap.set(year, y);
  }
  const yearSaved = (y: FlowYear) =>
    Object.values(y.parts).reduce(
      (s, p) => s + p.fresh + p.reinvest - p.withdraw,
      0,
    );
  const years = [...yearMap.values()].sort((a, b) => a.year - b.year);
  let running = 0;
  for (const y of years) {
    running += yearSaved(y);
    y.capital = running;
  }
  const bestYear = years.reduce<FlowYear | null>(
    (a, b) => (!a || yearSaved(b) > yearSaved(a) ? b : a),
    null,
  );

  // ---- history (filtered) ----
  const rows = all.filter(
    (c) =>
      (!filterPort || c.portfolioId === filterPort) &&
      (!filterKind || kindOf(c) === filterKind),
  );
  const portCount = (id: number | null) =>
    all.filter(
      (c) =>
        (!id || c.portfolioId === id) &&
        (!filterKind || kindOf(c) === filterKind),
    ).length;
  const kindCount = (k: Kind | null) =>
    all.filter(
      (c) =>
        (!k || kindOf(c) === k) &&
        (!filterPort || c.portfolioId === filterPort),
    ).length;
  const shownKinds = (Object.keys(KINDS) as Kind[]).filter(
    (k) => k === "new" || k === "withdraw" || all.some((c) => kindOf(c) === k),
  );
  const showPortfolio =
    !filterPort && new Set(rows.map((r) => r.portfolioId)).size > 1;

  const groups: {
    year: number;
    items: Cashflow[];
    fresh: number;
    reinvest: number;
    withdraw: number;
  }[] = [];
  for (const c of rows) {
    const year = yearOf(c.date);
    let g = groups.at(-1);
    if (!g || g.year !== year)
      groups.push(
        (g = { year, items: [], fresh: 0, reinvest: 0, withdraw: 0 }),
      );
    g.items.push(c);
    const k = kindOf(c);
    g[k === "withdraw" ? "withdraw" : k === "new" ? "fresh" : "reinvest"] +=
      thb(c);
  }

  const chip = (
    href: string,
    active: boolean,
    label: ReactNode,
    count: number,
    color?: string,
  ) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${
        active
          ? "border-transparent bg-accent text-white shadow-sm dark:text-[#06281f]"
          : "border-line bg-surface hover:bg-subtle"
      }`}
    >
      {color ? (
        <span
          className="size-2.5 rounded-sm ring-1 ring-white/60"
          style={{ background: color }}
        />
      ) : null}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-subtle text-muted"}`}
      >
        {count}
      </span>
    </Link>
  );

  return (
    <>
      <PageHeader
        emoji="💸"
        title="ฝาก-ถอน"
        subtitle="เงินที่โอนเข้าและถอนออกจากแต่ละพอร์ต แยกเงินใหม่กับกำไรที่นำกลับมาลงทุน"
      >
        <NewButton basePath="/cashflows" href={query({ extra: "new=1" })} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:grid-cols-3">
        <Stat
          emoji={<ArrowDownLeft className="size-5" />}
          iconClassName="bg-pos-soft text-pos"
          label="ฝากรวม (฿)"
          value={fmt(fresh + reinvestDividend + reinvestRealized)}
          tone="text-pos"
          hint={`💰 เงินใหม่ ${fmt(fresh, 0)} · 🔁 นำกลับ ${fmt(reinvestDividend + reinvestRealized, 0)}`}
        />
        <Stat
          emoji={<ArrowUpRight className="size-5" />}
          iconClassName="bg-neg-soft text-neg"
          label="ถอนรวม (฿)"
          value={fmt(withdraw)}
          tone="text-neg"
          hint={`${byKind("withdraw").length} ครั้ง`}
        />
        <Stat
          emoji={<Landmark className="size-5" />}
          iconClassName="bg-accent-soft text-accent"
          label="เงินต้น (ฝาก − ถอน) (฿)"
          value={fmt(netInTotal)}
          hint="รวมเงินทบต้นแล้ว · ใช้คำนวณกำไร %"
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="เงินเข้า-ออกรายปี (฿)"
          icon={<BarChart3 className="size-5" />}
          className="xl:col-span-2"
          action={
            bestYear && yearSaved(bestYear) > 0 ? (
              <span className="badge bg-pos-soft text-pos">
                💪 ออมมากสุดปี {bestYear.year}: {fmt(yearSaved(bestYear), 0)}
              </span>
            ) : null
          }
        >
          <CashflowChart series={series} years={years} />
        </Card>

        <Card title="เงินต้นแยกตามพอร์ต" icon={<Wallet className="size-5" />}>
          {perPort.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              🌱 ยังไม่มีข้อมูล
            </p>
          ) : null}
          {/* share of net money in, one segment per portfolio */}
          {perPort.length > 1 && netInTotal > 0 ? (
            <div className="mb-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
              {perPort
                .filter((x) => x.netIn > 0)
                .map((x) => (
                  <div
                    key={x.p.id}
                    style={{ flexGrow: x.netIn, background: x.color }}
                    title={x.p.name}
                  />
                ))}
            </div>
          ) : null}
          <ul className="space-y-1">
            {perPort.map((x) => (
              <li key={x.p.id}>
                <Link
                  href={query({ h: x.p.id }) + "#history"}
                  scroll={false}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-subtle ${filterPort === x.p.id ? "bg-subtle" : ""}`}
                  title="ดูประวัติพอร์ตนี้"
                >
                  <span
                    className="h-10 w-1 shrink-0 rounded-full"
                    style={{ background: x.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {portfolioEmoji(x.p)} {x.p.name}
                        </span>
                        {x.netNative !== null ? (
                          <span
                            className="badge shrink-0 bg-subtle text-[11px] text-foreground tabular-nums"
                            title={`ยอดสุทธิในสกุล ${x.p.currency} (ฝาก − ถอน)${x.netNative > 0 ? ` · เฉลี่ย ${fmt(x.netIn / x.netNative)} ฿/${x.p.currency}` : ""}`}
                          >
                            💵 {fmt(x.netNative)} {x.p.currency}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${x.netIn < 0 ? "text-neg" : ""}`}
                        title="เงินเข้าพอร์ตสุทธิ = เงินใหม่ + นำกลับมาลงทุน − ถอน"
                      >
                        {fmt(x.netIn)}
                      </span>
                    </span>
                    <span className="flex justify-between gap-2 text-xs text-muted tabular-nums">
                      <span>
                        💰 เงินใหม่ {fmt(x.fresh, 0)}
                        {x.reinvest ? (
                          <span> · 🔁 ทบต้น {fmt(x.reinvest, 0)}</span>
                        ) : null}
                        {x.withdraw ? (
                          <span> · ถอน −{fmt(x.withdraw, 0)}</span>
                        ) : null}
                      </span>
                      {netInTotal > 0 && perPort.length > 1 ? (
                        <span>
                          {fmtPct((Math.max(0, x.netIn) / netInTotal) * 100)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            💡 เงินต้น = 💰 เงินใหม่ + 🔁 เงินทบต้น (ปันผล/กำไรที่นำกลับมาลงทุน)
            − ถอน
          </p>
        </Card>
      </div>

      <FormModal
        open={!!editing || sp.new === "1"}
        emoji="💸"
        title={editing ? "แก้ไขรายการฝาก-ถอน" : "บันทึกฝาก-ถอน"}
        closeHref={listHref}
      >
        <ActionForm
          key={editing?.id ?? "new"}
          action={saveCashflowAction}
          editId={editing?.id}
          cancelHref={listHref}
        >
          <Field label="พอร์ต">
            <PortfolioSelect
              portfolios={portfolios}
              defaultValue={editing?.portfolioId ?? filterPort ?? undefined}
            />
          </Field>
          <Field label="ประเภท">
            <select
              name="type"
              defaultValue={
                editing?.type ??
                (filterKind === "withdraw" ? "withdraw" : "deposit")
              }
              className="input"
            >
              <option value="deposit">⬇️ ฝาก</option>
              <option value="withdraw">⬆️ ถอน</option>
            </select>
          </Field>
          <Field
            label="ที่มาของเงิน (เฉพาะรายการฝาก)"
            wide
            hint="ใช้แยกให้เห็นว่าเงินก้อนไหนเป็นเงินใหม่ และก้อนไหนเป็นเงินทบต้น ทุกแบบนับเป็นเงินต้น"
          >
            <select
              name="source"
              defaultValue={
                editing?.source ??
                (filterKind && filterKind !== "withdraw" ? filterKind : "new")
              }
              className="input"
            >
              {(
                Object.keys(
                  CASH_SOURCE_LABEL,
                ) as (keyof typeof CASH_SOURCE_LABEL)[]
              ).map((s) => (
                <option key={s} value={s}>
                  {CASH_SOURCE_LABEL[s].emoji} {CASH_SOURCE_LABEL[s].label}:{" "}
                  {CASH_SOURCE_LABEL[s].hint}
                </option>
              ))}
            </select>
          </Field>
          <Field label="จำนวนเงิน (สกุลเงินของพอร์ต)">
            <input
              name="amount"
              inputMode="decimal"
              defaultValue={editing?.amount}
              className="input"
              required
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
          {hasForeign ? (
            <Field
              label="ยอดเงินบาทที่โอนจริง"
              hint="🌏 เฉพาะพอร์ตต่างประเทศ เช่น แลก 1,000 USD ใช้ 34,500 บาท ใช้คำนวณกำไร/ขาดทุนจากค่าเงิน"
            >
              <input
                name="amountThb"
                inputMode="decimal"
                defaultValue={
                  editing &&
                  portById.get(editing.portfolioId)?.currency !== "THB"
                    ? (editing.amountThb ?? "")
                    : ""
                }
                placeholder="ไม่บังคับ"
                className="input"
              />
            </Field>
          ) : null}
          <Field label="บัญชี">
            <input
              name="account"
              defaultValue={editing?.account ?? ""}
              placeholder="เช่น BBK - Bank Transfer"
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
            table="cashflows"
            id={editing.id}
            label={`รายการ ${fmt(editing.amount)} วันที่ ${fmtDate(editing.date)}`}
          />
        ) : null}
      </FormModal>

      <section id="history" className="scroll-mt-6">
        <Card
          title="ประวัติ"
          icon={<ListOrdered className="size-5" />}
          action={
            <span className="text-xs text-muted">{rows.length} รายการ</span>
          }
        >
          {/* Filters are built from the user's own portfolios, so new or renamed portfolios appear automatically. */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {chip(
                query({ h: null }) + "#history",
                !filterPort,
                "🗂️ ทุกพอร์ต",
                portCount(null),
              )}
              {perPort.map((x) =>
                chip(
                  query({ h: x.p.id }) + "#history",
                  filterPort === x.p.id,
                  `${portfolioEmoji(x.p)} ${x.p.name}`,
                  portCount(x.p.id),
                  x.color,
                ),
              )}
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {chip(
                query({ t: null }) + "#history",
                !filterKind,
                "ทั้งหมด",
                kindCount(null),
              )}
              {shownKinds.map((k) =>
                chip(
                  query({ t: k }) + "#history",
                  filterKind === k,
                  KINDS[k],
                  kindCount(k),
                ),
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              {all.length === 0
                ? "💸 ยังไม่มีรายการ เริ่มจากบันทึกเงินฝากก้อนแรก"
                : "🔍 ไม่มีรายการที่ตรงกับตัวกรอง"}
            </p>
          ) : null}

          <div className="space-y-3">
            {groups.map((g, gi) => (
              <details
                key={g.year}
                open={gi === 0}
                className="group/year overflow-hidden rounded-xl border border-line"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 bg-gradient-to-r from-accent-soft via-accent-soft/40 to-surface-2 px-4 py-3 sm:gap-x-4 select-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 text-muted transition-transform group-open/year:rotate-90" />
                  <span className="text-base font-semibold">{g.year}</span>
                  <span className="text-xs text-muted">
                    {g.items.length} รายการ
                  </span>
                  {/* Phones: net on the first line, details on a second line; wider screens: one line. */}
                  <span
                    className={`badge ml-auto tabular-nums sm:order-last sm:ml-0 ${g.fresh + g.reinvest - g.withdraw >= 0 ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                    title="ฝาก (เงินใหม่ + นำกลับ) − ถอน"
                  >
                    สุทธิ {fmtSigned(g.fresh + g.reinvest - g.withdraw)}
                  </span>
                  <span className="order-last flex basis-full flex-wrap items-center gap-x-3 gap-y-0.5 pl-7 text-xs tabular-nums sm:order-none sm:ml-auto sm:basis-auto sm:gap-x-4 sm:pl-0 sm:text-sm">
                    {g.fresh ? (
                      <span className="text-pos">💰 +{fmt(g.fresh)}</span>
                    ) : null}
                    {g.reinvest ? (
                      <span className="text-muted">🔁 +{fmt(g.reinvest)}</span>
                    ) : null}
                    {g.withdraw ? (
                      <span className="text-neg">−{fmt(g.withdraw)}</span>
                    ) : null}
                  </span>
                </summary>
                <div className="px-3 sm:hidden">
                  <MobileList>
                    {g.items.map((c) => {
                      const p = portById.get(c.portfolioId);
                      const ccy = p?.currency ?? "THB";
                      const isDeposit = c.type === "deposit";
                      const src = CASH_SOURCE_LABEL[c.source];
                      return (
                        <MobileItem
                          key={c.id}
                          href={query({ extra: `edit=${c.id}` })}
                          icon={
                            isDeposit ? (
                              <ArrowDownLeft className="size-4" />
                            ) : (
                              <ArrowUpRight className="size-4" />
                            )
                          }
                          iconClassName={
                            isDeposit
                              ? "bg-pos-soft text-pos"
                              : "bg-neg-soft text-neg"
                          }
                          title={isDeposit ? "ฝาก" : "ถอน"}
                          badge={
                            isDeposit && !isFreshMoney(c) ? (
                              <span className="badge shrink-0 bg-accent-soft text-[10px] text-accent">
                                {src.emoji} {src.label}
                              </span>
                            ) : null
                          }
                          subtitle={[
                            fmtDate(c.date),
                            showPortfolio && p ? portfolioEmoji(p) : null,
                            c.account || null,
                            c.note ? `📝 ${c.note}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          amount={
                            <>
                              {isDeposit ? "+" : "−"}
                              <Money value={c.amount} currency={ccy} />
                            </>
                          }
                          amountClassName={
                            isDeposit
                              ? isFreshMoney(c)
                                ? "text-pos"
                                : "text-foreground"
                              : "text-neg"
                          }
                          meta={
                            ccy !== "THB"
                              ? `≈ ${fmt(c.amountThb ?? thb(c))} ฿`
                              : undefined
                          }
                        />
                      );
                    })}
                  </MobileList>
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>รายการ</th>
                        {showPortfolio ? <th>พอร์ต</th> : null}
                        <th className="num">จำนวนเงิน</th>
                        {hasForeign ? (
                          <th className="num">เป็นเงินบาท</th>
                        ) : null}
                        <th>บัญชี / หมายเหตุ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((c) => {
                        const p = portById.get(c.portfolioId);
                        const ccy = p?.currency ?? "THB";
                        const isDeposit = c.type === "deposit";
                        const src = CASH_SOURCE_LABEL[c.source];
                        return (
                          <tr key={c.id}>
                            <td
                              className="text-muted tabular-nums"
                              data-label="วันที่"
                            >
                              {fmtDate(c.date)}
                            </td>
                            <td data-title>
                              <span className="flex items-center gap-2.5">
                                <span
                                  className={`flex size-8 items-center justify-center rounded-full ${isDeposit ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                                >
                                  {isDeposit ? (
                                    <ArrowDownLeft className="size-4" />
                                  ) : (
                                    <ArrowUpRight className="size-4" />
                                  )}
                                </span>
                                <span className="font-medium">
                                  {isDeposit ? "ฝาก" : "ถอน"}
                                </span>
                                {isDeposit && !isFreshMoney(c) ? (
                                  <span
                                    className="badge bg-accent-soft text-accent"
                                    title={src.hint}
                                  >
                                    {src.emoji} {src.label}
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            {showPortfolio ? (
                              <td data-label="พอร์ต">
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="size-2.5 rounded-sm"
                                    style={{
                                      background: colorOf.get(c.portfolioId),
                                    }}
                                  />
                                  {p ? portfolioEmoji(p) : ""} {p?.name}
                                </span>
                              </td>
                            ) : null}
                            <td
                              className={`num font-semibold ${isDeposit ? (isFreshMoney(c) ? "text-pos" : "text-foreground") : "text-neg"}`}
                              data-label="จำนวนเงิน"
                            >
                              {isDeposit ? "+" : "−"}
                              <Money value={c.amount} currency={ccy} />
                            </td>
                            {hasForeign ? (
                              <td
                                className="num text-muted"
                                data-label="เป็นเงินบาท"
                              >
                                {ccy === "THB" ? (
                                  ""
                                ) : c.amountThb === null ? (
                                  <span title="ประมาณจากอัตราปัจจุบัน">
                                    ≈ {fmt(thb(c))}
                                  </span>
                                ) : (
                                  fmt(c.amountThb)
                                )}
                              </td>
                            ) : null}
                            <td
                              className="max-w-xs"
                              data-label="บัญชี / หมายเหตุ"
                              data-wide
                            >
                              <span className="block truncate">
                                {c.account || (
                                  <span className="text-muted">-</span>
                                )}
                              </span>
                              {c.note ? (
                                <span className="block truncate text-xs text-muted">
                                  📝 {c.note}
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <RowActions
                                href={query({ extra: `edit=${c.id}` })}
                                table="cashflows"
                                id={c.id}
                                label={`รายการ ${fmt(c.amount)} วันที่ ${fmtDate(c.date)}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}
