import Link from "next/link";
import {
  CalendarRange,
  ChartPie,
  PieChart,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
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
  summarizePortfolio,
  yearlySummary,
} from "@/lib/calc";
import { saveGoalAction } from "@/app/actions";
import {
  ASSET_LABEL,
  fmt,
  fmtPct,
  fmtSigned,
  toneClass,
  portfolioEmoji,
  seriesColor,
} from "@/lib/format";
import { PortfolioDonut } from "@/components/portfolio-donut";
import { GrowthChart } from "@/components/growth-chart";
import { ActionForm } from "@/components/action-form";
import {
  Card,
  EmptyRow,
  PageHeader,
  PortfolioTabs,
  pickPortfolio,
  Stat,
  MobileItem,
  MobileList,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

const greeting = () => {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }).format(new Date()),
  );
  return h < 12
    ? "อรุณสวัสดิ์ ☀️"
    : h < 17
      ? "สวัสดีตอนบ่าย 🌤️"
      : "สวัสดีตอนเย็น 🌙";
};

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const current = pickPortfolio(portfolios, sp.p);

  const cashflows = listCashflows(user.id);
  const trades = listTrades(user.id);
  const dividends = listDividends(user.id);
  const fx = buildFx(portfolios, cashflows, listFxRates(user.id));
  const pos = computePositions(
    trades,
    listPrices(user.id),
    listPositions(user.id),
  );
  const { realized } = pos;

  const summaries = portfolios.map((p) =>
    summarizePortfolio(p, cashflows, trades, dividends, pos, fx),
  );
  const shown = current
    ? summaries.filter((s) => s.portfolio.id === current)
    : summaries;
  const sum = (
    k:
      | "capitalThb"
      | "valueThb"
      | "cashThb"
      | "dividendsThb"
      | "realizedThb"
      | "unrealizedThb"
      | "reinvestedThb"
      | "dividendsOutsideThb"
      | "untrackedThb"
      | "profitThb",
  ) => shown.reduce((s, x) => s + x[k], 0);
  const capital = sum("capitalThb");
  const value = sum("valueThb");
  const profit = sum("profitThb");
  const profitPct = capital > 0 ? (profit / capital) * 100 : 0;
  // Portfolios with activity whose broker cash has not been entered yet (counted as 0).
  const cashMissing = shown.filter(
    (x) =>
      !x.cashEntered &&
      (x.capitalThb !== 0 || x.reinvestedThb !== 0 || x.costBasis !== 0),
  );
  // The per-portfolio table always lists every portfolio, so its total row sums all of them.
  const tableCost = summaries.reduce((t, x) => t + x.costBasis * x.fxRate, 0);
  const tableMarket = summaries.reduce(
    (t, x) => t + x.holdingsValue * x.fxRate,
    0,
  );
  const pastTrading = sum("realizedThb") + sum("untrackedThb");
  // Dividend % uses the capital of the portfolios that pay dividends (not crypto), the same base
  // as the dividends page and the owner's sheet.
  const dividendCapital = shown
    .filter((x) => x.dividendsThb !== 0)
    .reduce((t, x) => t + x.capitalThb, 0);
  // % helpers for the stat tiles: P/L against capital, unrealized against the holdings' cost.
  const pctOf = (n: number, base: number) => (base > 0 ? (n / base) * 100 : 0);
  const holdingsCost = shown.reduce((s, x) => s + x.costBasis * x.fxRate, 0);
  const pctHint = (n: number, base: number, of: string) => (
    <>
      <span className={`font-semibold ${toneClass(n)}`}>
        {fmtPct(pctOf(n, base))}
      </span>{" "}
      {of}
    </>
  );

  const inScope = <T extends { portfolioId: number }>(xs: T[]) =>
    current ? xs.filter((x) => x.portfolioId === current) : xs;
  const years = yearlySummary(
    inScope(cashflows),
    inScope(dividends),
    inScope(realized),
    fx,
  ).reverse();

  const allocation = [
    ...(["stock", "etf", "crypto"] as const).map((k) => ({
      key: k,
      emoji: ASSET_LABEL[k].emoji,
      label: ASSET_LABEL[k].label,
      value: shown.reduce((s, x) => s + x.byAssetThb[k], 0),
      color: {
        stock: "bg-sky-500",
        etf: "bg-violet-500",
        crypto: "bg-amber-500",
      }[k],
    })),
    {
      key: "cash",
      emoji: "💵",
      label: "เงินสด",
      value: Math.max(0, sum("cashThb")),
      color: "bg-emerald-500",
    },
  ].filter((a) => a.value > 0);
  const allocTotal = allocation.reduce((s, a) => s + a.value, 0);

  const totalValue = summaries.reduce((s, x) => s + x.valueThb, 0);
  const goal = user.goalAmount;
  const progress = goal > 0 ? Math.min(100, (totalValue / goal) * 100) : 0;

  return (
    <>
      <PageHeader
        emoji="📊"
        title="ภาพรวม"
        subtitle={`${greeting()} คุณ ${user.username}`}
      >
        <PortfolioTabs portfolios={portfolios} current={current} basePath="/" />
      </PageHeader>

      {cashMissing.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-warn-soft px-4 py-3 text-sm">
          <span>
            ⚠️ ยังไม่ได้ใส่ยอดเงินสดในโบรกของ{" "}
            {cashMissing.map((x) => x.portfolio.name).join(", ")} ตอนนี้นับเป็น
            0 มูลค่าพอร์ตและกำไรจะตรงกับความจริงเมื่อใส่ยอดจากแอปโบรก
          </span>
          <Link
            href="/holdings"
            className="font-semibold text-accent hover:underline"
          >
            ใส่เงินสดในโบรก →
          </Link>
        </div>
      ) : null}

      {fx.missing.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-warn-soft px-4 py-3 text-sm">
          <span>
            ⚠️ ยังไม่มีอัตราแลกเปลี่ยนของ {fx.missing.join(", ")}{" "}
            มูลค่าในสกุลเงินนี้จึงยังไม่ถูกนับเป็นบาท
          </span>
          <Link
            href="/portfolios"
            className="font-semibold text-accent hover:underline"
          >
            ตั้งค่าอัตราแลกเปลี่ยน →
          </Link>
        </div>
      ) : null}

      <section className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-5 py-4 text-white shadow-lg">
        <div className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-white/80">💰 มูลค่าพอร์ตรวม (บาท)</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {fmt(value)}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-0.5 text-sm backdrop-blur">
              {profit >= 0 ? "📈" : "📉"} {fmtSigned(profit)} (
              {fmtPct(profitPct)})
              <span className="text-white/70">
                {profit >= 0 ? "เยี่ยมมาก! 🎉" : "ใจเย็นๆ ลงทุนระยะยาว 💪"}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <span className="text-white/75">💰 เงินต้น (รวมทบต้น)</span>
            <span className="text-right font-semibold tabular-nums">
              {fmt(capital)}
            </span>
            <span className="text-white/75">💵 เงินสดในโบรก</span>
            <span className="text-right font-semibold tabular-nums">
              {fmt(sum("cashThb"))}
            </span>
            <span className="text-white/75">🎁 ปันผลที่อยู่นอกพอร์ต</span>
            <span className="text-right font-semibold tabular-nums">
              {fmt(sum("dividendsOutsideThb"))}
            </span>
          </div>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          emoji="🏦"
          label="เงินต้น (รวมทบต้น)"
          value={fmt(capital)}
          hint={
            sum("reinvestedThb")
              ? `รวมเงินทบต้น ${fmt(sum("reinvestedThb"), 0)}`
              : undefined
          }
        />
        <Stat
          emoji={pastTrading >= 0 ? "✅" : "📉"}
          label="กำไร/ขาดทุนจากการขายหุ้นในอดีต"
          value={fmtSigned(pastTrading)}
          tone={toneClass(pastTrading)}
          hint={pctHint(pastTrading, capital, "ของเงินต้น")}
        />
        <Stat
          emoji="⏳"
          label="กำไรที่ยังไม่ขาย"
          value={fmtSigned(sum("unrealizedThb"))}
          tone={toneClass(sum("unrealizedThb"))}
          hint={pctHint(
            sum("unrealizedThb"),
            holdingsCost,
            "ของต้นทุนหุ้นที่ถือ",
          )}
        />
        <Stat
          emoji="🎁"
          label="ปันผลสุทธิสะสม"
          value={fmt(sum("dividendsThb"))}
          hint={
            <>
              <span className="font-semibold text-pos">
                {fmtPct(pctOf(sum("dividendsThb"), dividendCapital))}
              </span>{" "}
              ของเงินต้นพอร์ตหุ้น · ยังอยู่นอกพอร์ต{" "}
              {fmt(sum("dividendsOutsideThb"), 0)}
            </>
          }
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="มูลค่าแยกตามพอร์ต" icon={<ChartPie className="size-5" />}>
          <PortfolioDonut
            small
            slices={summaries.map((x, i) => ({
              id: x.portfolio.id,
              emoji: portfolioEmoji(x.portfolio),
              name: x.portfolio.name,
              value: x.valueThb,
              color: seriesColor(i),
              info: [
                ["ต้นทุนหุ้น", fmt(x.costBasis * x.fxRate)],
                [
                  "กำไร/ขาดทุน",
                  `${fmtSigned(x.unrealizedThb)} (${fmtPct(pctOf(x.unrealizedThb, x.costBasis * x.fxRate))})`,
                ],
                [
                  "เงินสดในโบรก",
                  x.cashEntered ? fmt(x.cashThb) : "ยังไม่ได้ใส่",
                ],
              ] as [string, string][],
            }))}
          />
        </Card>
        <Card
          title="เงินต้นสะสมรายปี (฿)"
          icon={<TrendingUp className="size-5" />}
          className="lg:col-span-2"
        >
          <GrowthChart years={[...years].reverse()} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="เป้าหมาย" icon={<Target className="size-5" />}>
          {goal > 0 ? (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-3xl font-bold tabular-nums">
                  {fmtPct(progress)}
                </span>
                <span className="text-sm text-muted">🎯 {fmt(goal, 0)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-3 text-sm">
                {totalValue >= goal ? (
                  <span className="font-semibold text-pos">
                    🏆 ถึงเป้าแล้ว ยินดีด้วย!
                  </span>
                ) : (
                  <>
                    อีก{" "}
                    <span className="font-semibold">
                      {fmt(goal - totalValue)}
                    </span>{" "}
                    บาท ก็ถึงเป้า 🔥
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              🎯 ตั้งเป้าหมายมูลค่าพอร์ต แล้วติดตามความคืบหน้าได้ที่นี่
            </p>
          )}
          <ActionForm
            action={saveGoalAction}
            submitLabel="ตั้งเป้า"
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input
              name="goal"
              inputMode="decimal"
              defaultValue={goal || ""}
              placeholder="เช่น 2,500,000"
              className="input w-40 flex-1"
            />
          </ActionForm>
        </Card>

        <Card
          title="สัดส่วนสินทรัพย์"
          icon={<PieChart className="size-5" />}
          className="lg:col-span-2"
        >
          {allocTotal > 0 ? (
            <>
              <div className="flex h-4 overflow-hidden rounded-full bg-subtle">
                {allocation.map((a) => (
                  <div
                    key={a.key}
                    className={a.color}
                    style={{ width: `${(a.value / allocTotal) * 100}%` }}
                    title={a.label}
                  />
                ))}
              </div>
              <div
                className={`mt-5 grid gap-3 sm:grid-cols-3 ${allocation.length > 3 ? "2xl:grid-cols-4" : ""}`}
              >
                {allocation.map((a) => (
                  <div
                    key={a.key}
                    className="flex items-center gap-3 rounded-xl bg-surface-2 p-3"
                  >
                    <span className="text-2xl">{a.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className={`size-2.5 rounded-full ${a.color}`} />
                        {a.label}
                      </p>
                      <p className="font-semibold tabular-nums">
                        {fmt(a.value)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-muted tabular-nums">
                      {fmtPct((a.value / allocTotal) * 100)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              🌱 ยังไม่มีสินทรัพย์ เริ่มจากบันทึกเงินฝากและการซื้อ
            </p>
          )}
        </Card>
      </div>

      <Card
        title="พอร์ตปัจจุบัน"
        icon={<Wallet className="size-5" />}
        className="mb-4"
      >
        <MobileList empty={summaries.length === 0 ? "🌱 ยังไม่มีพอร์ต" : null}>
          {summaries.map((s) => {
            const cost = s.costBasis * s.fxRate;
            return (
              <MobileItem
                key={s.portfolio.id}
                href={`/holdings?p=${s.portfolio.id}`}
                icon={portfolioEmoji(s.portfolio)}
                title={s.portfolio.name}
                subtitle={`ทุน ${fmt(cost, 0)} · 💵 ${s.cashEntered ? fmt(s.cashThb, 0) : "ยังไม่ใส่เงินสด"}`}
                amount={fmt(s.holdingsValue * s.fxRate)}
                meta={
                  <span className={toneClass(s.unrealizedThb)}>
                    {fmtSigned(s.unrealizedThb)} (
                    {fmtPct(cost > 0 ? (s.unrealizedThb / cost) * 100 : 0)})
                  </span>
                }
              />
            );
          })}
          {summaries.length > 1 ? (
            <li className="flex items-center justify-between gap-3 px-1 py-3 font-semibold">
              <span>รวม</span>
              <span className="text-right tabular-nums">
                {fmt(tableMarket)}
                <span
                  className={`block text-xs ${toneClass(tableMarket - tableCost)}`}
                >
                  {fmtSigned(tableMarket - tableCost)} (
                  {fmtPct(
                    tableCost > 0
                      ? ((tableMarket - tableCost) / tableCost) * 100
                      : 0,
                  )}
                  )
                </span>
              </span>
            </li>
          ) : null}
        </MobileList>
        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>พอร์ต</th>
                <th className="num">ต้นทุน (฿)</th>
                <th className="num">มูลค่าตลาด (฿)</th>
                <th className="num">กำไร/ขาดทุน (฿)</th>
                <th className="num">💵 เงินสดในโบรก (฿)</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? <EmptyRow cols={5} /> : null}
              {summaries.map((s) => {
                const cost = s.costBasis * s.fxRate;
                const market = s.holdingsValue * s.fxRate;
                return (
                  <tr key={s.portfolio.id}>
                    <td className="font-medium">
                      {portfolioEmoji(s.portfolio)} {s.portfolio.name}
                      {s.portfolio.currency !== "THB" ? (
                        <span className="ml-2 text-xs text-muted">
                          @ {fmt(s.fxRate, 2)} ฿/{s.portfolio.currency}
                        </span>
                      ) : null}
                    </td>
                    <td className="num" data-label="ต้นทุน (฿)">
                      {fmt(cost)}
                    </td>
                    <td className="num font-medium" data-label="มูลค่าตลาด (฿)">
                      {fmt(market)}
                    </td>
                    <td
                      className={`num font-semibold ${toneClass(s.unrealizedThb)}`}
                      data-label="กำไร/ขาดทุน (฿)"
                    >
                      {fmtSigned(s.unrealizedThb)}{" "}
                      <span className="text-xs">
                        ({fmtPct(cost > 0 ? (s.unrealizedThb / cost) * 100 : 0)}
                        )
                      </span>
                    </td>
                    <td
                      className="num text-muted"
                      data-label="💵 เงินสดในโบรก (฿)"
                    >
                      {s.cashEntered ? fmt(s.cashThb) : "ยังไม่ได้ใส่"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {summaries.length > 1 ? (
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2.5">รวม</td>
                  <td className="num px-3 py-2.5" data-label="ต้นทุน (฿)">
                    {fmt(tableCost)}
                  </td>
                  <td className="num px-3 py-2.5" data-label="มูลค่าตลาด (฿)">
                    {fmt(tableMarket)}
                  </td>
                  <td
                    className={`num px-3 py-2.5 ${toneClass(tableMarket - tableCost)}`}
                    data-label="กำไร/ขาดทุน (฿)"
                  >
                    {fmtSigned(tableMarket - tableCost)}{" "}
                    <span className="text-xs">
                      (
                      {fmtPct(
                        tableCost > 0
                          ? ((tableMarket - tableCost) / tableCost) * 100
                          : 0,
                      )}
                      )
                    </span>
                  </td>
                  <td
                    className="num px-3 py-2.5 text-muted"
                    data-label="💵 เงินสดในโบรก (฿)"
                  >
                    {fmt(summaries.reduce((t, x) => t + x.cashThb, 0))}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          💡 ต้นทุน / มูลค่าตลาด / กำไร-ขาดทุน คิดแบบเดียวกับหน้า Portfolio
          ในแอปโบรก · ยอดเงินฝาก-ถอนดูได้ที่หน้า ฝาก-ถอน
        </p>
      </Card>

      <Card title="สรุปรายปี (บาท)" icon={<CalendarRange className="size-5" />}>
        {/* Phones: one compact card per year. */}
        <ul className="grid gap-2.5 sm:hidden">
          {years.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted">
              📅 ยังไม่มีข้อมูล
            </li>
          ) : null}
          {years.map((y) => {
            const back = y.deposit - y.fresh;
            return (
              <li
                key={y.year}
                className="overflow-hidden rounded-xl border border-line"
              >
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-accent-soft via-accent-soft/40 to-surface-2 px-3 py-2">
                  <span className="font-semibold">{y.year}</span>
                  <span
                    className={`badge ${y.returnPct > 0 ? "bg-pos-soft text-pos" : y.returnPct < 0 ? "bg-neg-soft text-neg" : "bg-subtle text-muted"}`}
                    title="ผลตอบแทน %"
                  >
                    {y.returnPct > 0 ? "▲" : y.returnPct < 0 ? "▼" : "•"}{" "}
                    {fmtPct(y.returnPct)}
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-2 px-3 pt-2.5 text-xs tabular-nums">
                  {[
                    ["เงินเก็บสุทธิ", y.netDeposit, toneClass(y.netDeposit)],
                    ["ปันผลสุทธิ", y.dividendNet, ""],
                    ["เงินต้นสะสม", y.capital, ""],
                  ].map(([label, value, tone]) => (
                    <div key={label as string} className="min-w-0">
                      <dt className="truncate text-muted">{label}</dt>
                      <dd className={`truncate text-sm font-semibold ${tone}`}>
                        {fmt(value as number, 0)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pt-1.5 pb-2.5 text-xs text-muted tabular-nums">
                  <span className="text-pos">💰 +{fmt(y.fresh, 0)}</span>
                  {back ? <span>🔁 +{fmt(back, 0)}</span> : null}
                  {y.withdraw ? (
                    <span className="text-neg">ถอน −{fmt(y.withdraw, 0)}</span>
                  ) : null}
                  {y.realized ? (
                    <span className={toneClass(y.realized)}>
                      ขายแล้ว {fmtSigned(y.realized)}
                    </span>
                  ) : null}
                  <span>ปันผล {fmtPct(y.dividendYieldPct)}</span>
                </p>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>ปี</th>
                <th className="num">💰 เงินใหม่</th>
                <th className="num">🔁 นำกลับ</th>
                <th className="num">ถอน</th>
                <th className="num">เงินเก็บสุทธิ</th>
                <th className="num">ปันผลสุทธิ</th>
                <th className="num">กำไรที่ขายแล้ว</th>
                <th className="num">เงินต้นสะสม</th>
                <th className="num">ปันผล %</th>
                <th className="num">ผลตอบแทน %</th>
              </tr>
            </thead>
            <tbody>
              {years.length === 0 ? <EmptyRow cols={10} emoji="📅" /> : null}
              {years.map((y) => (
                <tr key={y.year}>
                  <td className="font-semibold">{y.year}</td>
                  <td className="num" data-label="💰 เงินใหม่">
                    {fmt(y.fresh)}
                  </td>
                  <td className="num text-muted" data-label="🔁 นำกลับ">
                    {y.deposit - y.fresh ? fmt(y.deposit - y.fresh) : "-"}
                  </td>
                  <td
                    className={`num ${y.withdraw ? "text-neg" : ""}`}
                    data-label="ถอน"
                  >
                    {y.withdraw ? `(${fmt(y.withdraw)})` : "-"}
                  </td>
                  <td
                    className={`num ${toneClass(y.netDeposit)}`}
                    data-label="เงินเก็บสุทธิ"
                  >
                    {fmt(y.netDeposit)}
                  </td>
                  <td className="num" data-label="ปันผลสุทธิ">
                    {fmt(y.dividendNet)}
                  </td>
                  <td
                    className={`num ${toneClass(y.realized)}`}
                    data-label="กำไรที่ขายแล้ว"
                  >
                    {fmtSigned(y.realized)}
                  </td>
                  <td className="num" data-label="เงินต้นสะสม">
                    {fmt(y.capital)}
                  </td>
                  <td className="num" data-label="ปันผล %">
                    {fmtPct(y.dividendYieldPct)}
                  </td>
                  <td className="num" data-label="ผลตอบแทน %">
                    <span
                      className={`badge ${y.returnPct > 0 ? "bg-pos-soft text-pos" : y.returnPct < 0 ? "bg-neg-soft text-neg" : "bg-subtle text-muted"}`}
                    >
                      {y.returnPct > 0 ? "▲" : y.returnPct < 0 ? "▼" : "•"}{" "}
                      {fmtPct(y.returnPct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          💡 เงินต้น = เงินใหม่ + เงินทบต้น − ถอน · ผลตอบแทน % = (กำไรที่ขายแล้ว
          + ปันผลสุทธิ) ÷ เงินต้นสะสม ณ สิ้นปี · ไม่รวมกำไรที่ยังไม่ได้ขาย ·
          สกุลเงินต่างประเทศแปลงด้วยอัตราปัจจุบัน
        </p>
      </Card>
    </>
  );
}
