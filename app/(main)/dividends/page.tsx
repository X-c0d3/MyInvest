import { CalendarRange, ListOrdered, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listCashflows, listDividends, listFxRates, listPortfolios } from "@/lib/data";
import { buildFx, dividendGross, dividendNet, dividendTax, yearlySummary } from "@/lib/calc";
import { saveDividendAction } from "@/app/actions";
import { CURRENCY_FLAG, fmt, fmtDate, fmtPct, fmtQty } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { Card, EmptyRow, Field, Money, PageHeader, PortfolioSelect, PortfolioTabs, RowActions, pickEdit, pickPortfolio, Stat, today } from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function DividendsPage({ searchParams }: PageProps<"/dividends">) {
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
  const cashflows = current ? allCashflows.filter((c) => c.portfolioId === current) : allCashflows;
  const years = yearlySummary(cashflows, rows, [], fx).filter((y) => y.dividendNet > 0).reverse();
  const totalNet = rows.reduce((s, d) => s + dividendNet(d) * fx.rateOf(d.portfolioId), 0);
  const totalTax = rows.reduce((s, d) => s + dividendTax(d) * fx.rateOf(d.portfolioId), 0);
  const maxYear = Math.max(1, ...years.map((y) => y.dividendNet));

  return (
    <>
      <PageHeader emoji="🎁" title="ปันผล" subtitle="ใส่จำนวนหุ้นและปันผลต่อหุ้น ระบบคำนวณยอดรวม ภาษี และยอดสุทธิให้">
        <PortfolioTabs portfolios={portfolios} current={current} basePath="/dividends" />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat emoji="💰" label="ปันผลสุทธิสะสม (฿)" value={fmt(totalNet)} tone="text-pos" />
        <Stat emoji="🧾" label="ภาษีหัก ณ ที่จ่ายสะสม (฿)" value={fmt(totalTax)} hint="หุ้นไทยใช้ขอคืนภาษีได้" />
        <Stat emoji="🔔" label="จำนวนครั้งที่ได้รับ" value={`${rows.length} ครั้ง`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title={editing ? "แก้ไขรายการปันผล" : "เพิ่มรายการปันผล"} icon={<PlusCircle className="size-5" />} className="lg:col-span-2">
          {portfolios.length === 0 ? (
            <p className="text-sm text-muted">📂 ยังไม่มีพอร์ตหุ้น เพิ่มได้ที่หน้า พอร์ต & ค่าเงิน</p>
          ) : (
            <ActionForm key={editing?.id ?? "new"} action={saveDividendAction} editId={editing?.id} cancelHref="/dividends" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="พอร์ต">
                <PortfolioSelect portfolios={portfolios} defaultValue={editing?.portfolioId ?? current ?? undefined} />
              </Field>
              <Field label="หุ้น / ETF">
                <input name="symbol" defaultValue={editing?.symbol} placeholder="เช่น SYNEX, VOO" className="input uppercase" required />
              </Field>
              <Field label="จำนวนหุ้น">
                <input name="shares" inputMode="decimal" defaultValue={editing?.shares} className="input" required />
              </Field>
              <Field label="ปันผลต่อหุ้น">
                <input name="dps" inputMode="decimal" defaultValue={editing?.dps} className="input" required />
              </Field>
              <Field label="ภาษีหัก ณ ที่จ่าย (%)" hint="หุ้นไทย 10% · หุ้น US 15% (W-8BEN)">
                <input name="taxRate" inputMode="decimal" defaultValue={editing?.taxRate ?? 10} className="input" />
              </Field>
              <Field label="วัน XD">
                <input name="xdDate" type="date" defaultValue={editing?.xdDate ?? ""} className="input" />
              </Field>
              <Field label="วันจ่ายปันผล">
                <input name="paidDate" type="date" defaultValue={editing?.paidDate ?? today()} className="input" required />
              </Field>
              <Field label="หมายเหตุ" wide>
                <input name="note" defaultValue={editing?.note ?? ""} className="input" />
              </Field>
            </ActionForm>
          )}
        </Card>

        <Card title="ปันผลรายปี (฿)" icon={<CalendarRange className="size-5" />}>
          {years.length === 0 ? <p className="py-8 text-center text-sm text-muted">📅 ยังไม่มีข้อมูล</p> : null}
          <ul className="space-y-3">
            {years.map((y) => (
              <li key={y.year}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{y.year}</span>
                  <span className="tabular-nums">
                    {fmt(y.dividendNet)} <span className="text-xs text-muted">({fmtPct(y.dividendYieldPct)})</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${(y.dividendNet / maxYear) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">💡 % เทียบกับเงินต้นสะสม (ฝาก − ถอน) ณ สิ้นปีนั้น</p>
        </Card>
      </div>

      <Card title="ประวัติ" icon={<ListOrdered className="size-5" />}>
        <div className="overflow-x-auto">
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
              {rows.length === 0 ? <EmptyRow cols={10} emoji="🎁" text="ยังไม่มีรายการปันผล" /> : null}
              {rows.map((d) => {
                const ccy = portById.get(d.portfolioId)?.currency ?? "THB";
                return (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.symbol}</td>
                    <td>
                      {CURRENCY_FLAG[ccy]} {portById.get(d.portfolioId)?.name}
                    </td>
                    <td className="num">{fmtQty(d.shares)}</td>
                    <td>{fmtDate(d.xdDate)}</td>
                    <td>{fmtDate(d.paidDate)}</td>
                    <td className="num">{fmt(d.dps, 4)}</td>
                    <td className="num">
                      <Money value={dividendGross(d)} currency={ccy} />
                    </td>
                    <td className="num text-muted">
                      {fmt(dividendTax(d))} <span className="text-xs">({Number(d.taxRate.toFixed(2))}%)</span>
                    </td>
                    <td className="num font-semibold text-pos">
                      <Money value={dividendNet(d)} currency={ccy} />
                    </td>
                    <td>
                      <RowActions href={`/dividends?edit=${d.id}`} table="dividends" id={d.id} label={`ปันผล ${d.symbol} วันที่ ${fmtDate(d.paidDate)}`} />
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
