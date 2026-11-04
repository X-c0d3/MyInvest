import Link from "next/link";
import { CalendarRange, PieChart, Target, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listDividends,
  listFxRates,
  listPortfolios,
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
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import {
  Card,
  EmptyRow,
  PageHeader,
  PortfolioTabs,
  pickPortfolio,
  Stat,
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
  const { holdings, realized } = computePositions(trades, listPrices(user.id));

  const summaries = portfolios.map((p) =>
    summarizePortfolio(p, cashflows, trades, dividends, holdings, realized, fx),
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
      | "profitThb",
  ) => shown.reduce((s, x) => s + x[k], 0);
  const capital = sum("capitalThb");
  const value = sum("valueThb");
  const profit = sum("profitThb");
  const profitPct = capital > 0 ? (profit / capital) * 100 : 0;

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
            <span className="text-white/75">💰 เงินต้นจากกระเป๋า</span>
            <span className="text-right font-semibold tabular-nums">
              {fmt(capital)}
            </span>
            <span className="text-white/75">เงินสดในพอร์ต</span>
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

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          emoji="🏦"
          label="เงินต้นจากกระเป๋า (เงินใหม่ − ถอน)"
          value={fmt(capital)}
          hint={
            sum("reinvestedThb")
              ? `ไม่รวมกำไรที่นำกลับมาลงทุน ${fmt(sum("reinvestedThb"), 0)}`
              : undefined
          }
        />
        <Stat
          emoji="✅"
          label="กำไรที่ขายแล้ว"
          value={fmtSigned(sum("realizedThb"))}
          tone={toneClass(sum("realizedThb"))}
        />
        <Stat
          emoji="⏳"
          label="กำไรที่ยังไม่ขาย"
          value={fmtSigned(sum("unrealizedThb"))}
          tone={toneClass(sum("unrealizedThb"))}
          hint="ใส่ราคาล่าสุดที่หน้า หลักทรัพย์ที่ถือ"
        />
        <Stat
          emoji="🎁"
          label="ปันผลสุทธิสะสม"
          value={fmt(sum("dividendsThb"))}
          hint={`นำกลับมาลงทุนแล้ว ${fmt(sum("dividendsThb") - sum("dividendsOutsideThb"), 0)} · ยังอยู่นอกพอร์ต ${fmt(sum("dividendsOutsideThb"), 0)}`}
        />
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
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
        title="แยกตามพอร์ต"
        icon={<Wallet className="size-5" />}
        className="mb-4"
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>พอร์ต</th>
                <th className="num">เงินต้นจากกระเป๋า (฿)</th>
                <th className="num">มูลค่า (สกุลพอร์ต)</th>
                <th className="num">มูลค่า (฿)</th>
                <th className="num">กำไร/ขาดทุน (฿)</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? <EmptyRow cols={5} /> : null}
              {summaries.map((s) => (
                <tr key={s.portfolio.id}>
                  <td className="font-medium">
                    {portfolioEmoji(s.portfolio)} {s.portfolio.name}
                    {s.portfolio.currency !== "THB" ? (
                      <span className="ml-2 text-xs text-muted">
                        @ {fmt(s.fxRate, 4)} ฿/{s.portfolio.currency}
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{fmt(s.capitalThb)}</td>
                  <td className="num">
                    {fmt(s.value)}{" "}
                    <span className="text-xs text-muted">
                      {s.portfolio.currency}
                    </span>
                  </td>
                  <td className="num font-medium">{fmt(s.valueThb)}</td>
                  <td className={`num ${toneClass(s.profitThb)}`}>
                    {fmtSigned(s.profitThb)}{" "}
                    <span className="text-xs">({fmtPct(s.profitPct)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="สรุปรายปี (บาท)" icon={<CalendarRange className="size-5" />}>
        <div className="overflow-x-auto">
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
                <th className="num">เงินต้นจากกระเป๋าสะสม</th>
                <th className="num">ปันผล %</th>
                <th className="num">ผลตอบแทน %</th>
              </tr>
            </thead>
            <tbody>
              {years.length === 0 ? <EmptyRow cols={10} emoji="📅" /> : null}
              {years.map((y) => (
                <tr key={y.year}>
                  <td className="font-semibold">{y.year}</td>
                  <td className="num">{fmt(y.fresh)}</td>
                  <td className="num text-muted">
                    {y.deposit - y.fresh ? fmt(y.deposit - y.fresh) : "-"}
                  </td>
                  <td className="num">
                    {y.withdraw ? `(${fmt(y.withdraw)})` : "-"}
                  </td>
                  <td className={`num ${toneClass(y.netDeposit)}`}>
                    {fmt(y.netDeposit)}
                  </td>
                  <td className="num">{fmt(y.dividendNet)}</td>
                  <td className={`num ${toneClass(y.realized)}`}>
                    {fmtSigned(y.realized)}
                  </td>
                  <td className="num">{fmt(y.capital)}</td>
                  <td className="num">{fmtPct(y.dividendYieldPct)}</td>
                  <td className="num">
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
          💡 เงินเก็บสุทธิ = เงินใหม่ − ถอน ·
          กำไรที่ขายแล้วรวมกำไรขายที่บันทึกย้อนหลัง · ผลตอบแทน % =
          (กำไรที่ขายแล้ว + ปันผลสุทธิ) ÷ เงินต้นจากกระเป๋าสะสม ณ สิ้นปี ·
          ไม่รวมกำไรที่ยังไม่ได้ขาย · สกุลเงินต่างประเทศแปลงด้วยอัตราปัจจุบัน
        </p>
      </Card>
    </>
  );
}
