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
import { listCashflows, listFxRates, listPortfolios } from "@/lib/data";
import { buildFx, cashflowThb, yearOf } from "@/lib/calc";
import { saveCashflowAction } from "@/app/actions";
import {
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
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

const TYPES = { deposit: "ฝาก", withdraw: "ถอน" } as const;
type FlowType = keyof typeof TYPES;

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
  const thb = (c: (typeof all)[number]) => cashflowThb(c, fx);

  // History filters live in the URL: ?h=<portfolio id> and ?t=deposit|withdraw.
  const filterPort = pickPortfolio(portfolios, sp.h);
  const filterType =
    (Object.keys(TYPES) as FlowType[]).find((t) => t === sp.t) ?? null;
  const query = (
    over: { h?: number | null; t?: FlowType | null; extra?: string } = {},
  ) => {
    const h = "h" in over ? over.h : filterPort;
    const t = "t" in over ? over.t : filterType;
    const qs = [h ? `h=${h}` : "", t ? `t=${t}` : "", over.extra ?? ""]
      .filter(Boolean)
      .join("&");
    return `/cashflows${qs ? `?${qs}` : ""}`;
  };
  const listHref = query();

  // ---- totals (all portfolios) ----
  const deposit = all
    .filter((c) => c.type === "deposit")
    .reduce((s, c) => s + thb(c), 0);
  const withdraw = all
    .filter((c) => c.type === "withdraw")
    .reduce((s, c) => s + thb(c), 0);
  const depositCount = all.filter((c) => c.type === "deposit").length;
  const netTotal = deposit - withdraw;

  // ---- per portfolio; colors follow the portfolio's position among all portfolios ----
  const perPort = portfolios
    .map((p, i) => {
      const rows = all.filter((c) => c.portfolioId === p.id);
      const dep = rows
        .filter((c) => c.type === "deposit")
        .reduce((s, c) => s + thb(c), 0);
      const wd = rows
        .filter((c) => c.type === "withdraw")
        .reduce((s, c) => s + thb(c), 0);
      return {
        p,
        color: seriesColor(i),
        count: rows.length,
        deposit: dep,
        withdraw: wd,
        net: dep - wd,
      };
    })
    .filter((x) => x.count > 0);
  const colorOf = new Map(perPort.map((x) => [x.p.id, x.color]));

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
    const part = (y.parts[c.portfolioId] ??= { deposit: 0, withdraw: 0 });
    part[c.type] += thb(c);
    yearMap.set(year, y);
  }
  const yearNet = (y: FlowYear) =>
    Object.values(y.parts).reduce((s, p) => s + p.deposit - p.withdraw, 0);
  const years = [...yearMap.values()].sort((a, b) => a.year - b.year);
  let running = 0;
  for (const y of years) {
    running += yearNet(y);
    y.capital = running;
  }
  const bestYear = years.reduce<FlowYear | null>(
    (a, b) => (!a || yearNet(b) > yearNet(a) ? b : a),
    null,
  );

  // ---- history (filtered) ----
  const rows = all.filter(
    (c) =>
      (!filterPort || c.portfolioId === filterPort) &&
      (!filterType || c.type === filterType),
  );
  const portCount = (id: number | null) =>
    all.filter(
      (c) =>
        (!id || c.portfolioId === id) && (!filterType || c.type === filterType),
    ).length;
  const typeCount = (t: FlowType | null) =>
    all.filter(
      (c) =>
        (!t || c.type === t) && (!filterPort || c.portfolioId === filterPort),
    ).length;
  const showPortfolio =
    !filterPort && new Set(rows.map((r) => r.portfolioId)).size > 1;

  const groups: {
    year: number;
    items: typeof rows;
    deposit: number;
    withdraw: number;
  }[] = [];
  for (const c of rows) {
    const year = yearOf(c.date);
    let g = groups.at(-1);
    if (!g || g.year !== year)
      groups.push((g = { year, items: [], deposit: 0, withdraw: 0 }));
    g.items.push(c);
    g[c.type] += thb(c);
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
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
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
        subtitle="เงินที่โอนเข้าและถอนออกจากแต่ละพอร์ต"
      >
        <NewButton basePath="/cashflows" href={query({ extra: "new=1" })} />
      </PageHeader>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          emoji={<ArrowDownLeft className="size-5" />}
          iconClassName="bg-pos-soft text-pos"
          label="ฝากรวม (฿)"
          value={fmt(deposit)}
          tone="text-pos"
          hint={`${depositCount} ครั้ง`}
        />
        <Stat
          emoji={<ArrowUpRight className="size-5" />}
          iconClassName="bg-neg-soft text-neg"
          label="ถอนรวม (฿)"
          value={fmt(withdraw)}
          tone="text-neg"
          hint={`${all.length - depositCount} ครั้ง`}
        />
        <Stat
          emoji={<Landmark className="size-5" />}
          iconClassName="bg-accent-soft text-accent"
          label="เงินต้นสุทธิ (฿)"
          value={fmt(netTotal)}
          hint={
            deposit > 0
              ? `ถอนออกไปแล้ว ${fmtPct((withdraw / deposit) * 100)} ของเงินที่ฝาก`
              : undefined
          }
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="เงินเข้า-ออกรายปี (฿)"
          icon={<BarChart3 className="size-5" />}
          className="xl:col-span-2"
          action={
            bestYear && yearNet(bestYear) > 0 ? (
              <span className="badge bg-pos-soft text-pos">
                💪 ออมมากสุดปี {bestYear.year}: {fmt(yearNet(bestYear), 0)}
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
          {/* share of net capital, one segment per portfolio */}
          {perPort.length > 1 && netTotal > 0 ? (
            <div className="mb-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
              {perPort
                .filter((x) => x.net > 0)
                .map((x) => (
                  <div
                    key={x.p.id}
                    style={{ flexGrow: x.net, background: x.color }}
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
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-subtle ${
                    filterPort === x.p.id ? "bg-subtle" : ""
                  }`}
                  title="ดูประวัติพอร์ตนี้"
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: x.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {portfolioEmoji(x.p)} {x.p.name}
                      </span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${x.net < 0 ? "text-neg" : ""}`}
                      >
                        {fmt(x.net, 0)}
                      </span>
                    </span>
                    <span className="flex justify-between gap-2 text-xs text-muted tabular-nums">
                      <span>
                        <span className="text-pos">+{fmt(x.deposit, 0)}</span>
                        {x.withdraw ? (
                          <span className="text-neg">
                            {" "}
                            −{fmt(x.withdraw, 0)}
                          </span>
                        ) : null}{" "}
                        · {x.count} รายการ
                      </span>
                      {netTotal > 0 && perPort.length > 1 ? (
                        <span>
                          {fmtPct((Math.max(0, x.net) / netTotal) * 100)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
              defaultValue={editing?.type ?? filterType ?? "deposit"}
              className="input"
            >
              <option value="deposit">⬇️ ฝาก</option>
              <option value="withdraw">⬆️ ถอน</option>
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
            <div className="flex flex-wrap gap-2">
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
            <div className="flex flex-wrap gap-2">
              {chip(
                query({ t: null }) + "#history",
                !filterType,
                "ทั้งหมด",
                typeCount(null),
              )}
              {(Object.keys(TYPES) as FlowType[]).map((t) =>
                chip(
                  query({ t }) + "#history",
                  filterType === t,
                  `${t === "deposit" ? "⬇️" : "⬆️"} ${TYPES[t]}`,
                  typeCount(t),
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
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 bg-surface-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 text-muted transition-transform group-open/year:rotate-90" />
                  <span className="text-base font-semibold">{g.year}</span>
                  <span className="text-xs text-muted">
                    {g.items.length} รายการ
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                    {g.deposit ? (
                      <span className="text-pos">+{fmt(g.deposit)}</span>
                    ) : null}
                    {g.withdraw ? (
                      <span className="text-neg">−{fmt(g.withdraw)}</span>
                    ) : null}
                    <span
                      className={`badge ${g.deposit - g.withdraw >= 0 ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                    >
                      สุทธิ {fmtSigned(g.deposit - g.withdraw)}
                    </span>
                  </span>
                </summary>
                <div className="overflow-x-auto">
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
                        return (
                          <tr key={c.id}>
                            <td className="text-muted tabular-nums">
                              {fmtDate(c.date)}
                            </td>
                            <td>
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
                                  {TYPES[c.type]}
                                </span>
                              </span>
                            </td>
                            {showPortfolio ? (
                              <td>
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
                              className={`num font-semibold ${isDeposit ? "text-pos" : "text-neg"}`}
                            >
                              {isDeposit ? "+" : "−"}
                              <Money value={c.amount} currency={ccy} />
                            </td>
                            {hasForeign ? (
                              <td className="num text-muted">
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
                            <td className="max-w-xs">
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
