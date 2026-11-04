import { ListOrdered, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listCashflows, listFxRates, listPortfolios } from "@/lib/data";
import { buildFx, cashflowThb } from "@/lib/calc";
import { saveCashflowAction } from "@/app/actions";
import { CURRENCY_FLAG, fmt, fmtDate } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { Card, EmptyRow, Field, Money, PageHeader, PortfolioSelect, PortfolioTabs, RowActions, pickEdit, pickPortfolio, Stat, today } from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function CashflowsPage({ searchParams }: PageProps<"/cashflows">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const current = pickPortfolio(portfolios, sp.p);
  const all = listCashflows(user.id);
  const rows = current ? all.filter((c) => c.portfolioId === current) : all;
  const editing = all.find((c) => c.id === pickEdit(sp.edit));
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  const fx = buildFx(portfolios, all, listFxRates(user.id));
  const hasForeign = portfolios.some((p) => p.currency !== "THB");

  const total = (type: "deposit" | "withdraw") => rows.filter((r) => r.type === type).reduce((s, r) => s + cashflowThb(r, fx), 0);
  const deposit = total("deposit");
  const withdraw = total("withdraw");

  return (
    <>
      <PageHeader emoji="💸" title="ฝาก-ถอน" subtitle="เงินที่โอนเข้าและถอนออกจากพอร์ต">
        <PortfolioTabs portfolios={portfolios} current={current} basePath="/cashflows" />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat emoji="📥" label="ฝากรวม (฿)" value={fmt(deposit)} tone="text-pos" />
        <Stat emoji="📤" label="ถอนรวม (฿)" value={fmt(withdraw)} tone="text-neg" />
        <Stat emoji="🏦" label="เงินต้นสุทธิ (฿)" value={fmt(deposit - withdraw)} />
      </div>

      <Card title={editing ? "แก้ไขรายการฝาก-ถอน" : "เพิ่มรายการฝาก-ถอน"} icon={<PlusCircle className="size-5" />} className="mb-6">
        <ActionForm key={editing?.id ?? "new"} action={saveCashflowAction} editId={editing?.id} cancelHref="/cashflows">
          <Field label="พอร์ต">
            <PortfolioSelect portfolios={portfolios} defaultValue={editing?.portfolioId ?? current ?? undefined} />
          </Field>
          <Field label="ประเภท">
            <select name="type" defaultValue={editing?.type ?? "deposit"} className="input">
              <option value="deposit">📥 ฝาก</option>
              <option value="withdraw">📤 ถอน</option>
            </select>
          </Field>
          <Field label="จำนวนเงิน (สกุลเงินของพอร์ต)">
            <input name="amount" inputMode="decimal" defaultValue={editing?.amount} className="input" required />
          </Field>
          <Field label="วันที่">
            <input name="date" type="date" defaultValue={editing?.date ?? today()} className="input" required />
          </Field>
          {hasForeign ? (
            <Field label="ยอดเงินบาทที่โอนจริง" hint="🌏 เฉพาะพอร์ตต่างประเทศ เช่น แลก 1,000 USD ใช้ 34,500 บาท ใช้คำนวณกำไร/ขาดทุนจากค่าเงิน">
              <input
                name="amountThb"
                inputMode="decimal"
                defaultValue={editing && portById.get(editing.portfolioId)?.currency !== "THB" ? (editing.amountThb ?? "") : ""}
                placeholder="ไม่บังคับ"
                className="input"
              />
            </Field>
          ) : null}
          <Field label="บัญชี">
            <input name="account" defaultValue={editing?.account ?? ""} placeholder="เช่น BBK - Bank Transfer" className="input" />
          </Field>
          <Field label="หมายเหตุ" wide>
            <input name="note" defaultValue={editing?.note ?? ""} className="input" />
          </Field>
        </ActionForm>
      </Card>

      <Card title="ประวัติ" icon={<ListOrdered className="size-5" />}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>พอร์ต</th>
                <th>ประเภท</th>
                <th className="num">จำนวนเงิน</th>
                <th className="num">เป็นเงินบาท</th>
                <th>บัญชี</th>
                <th>หมายเหตุ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow cols={8} emoji="💸" text="ยังไม่มีรายการ เริ่มจากบันทึกเงินฝากก้อนแรก" /> : null}
              {rows.map((c) => {
                const p = portById.get(c.portfolioId);
                const ccy = p?.currency ?? "THB";
                const isDeposit = c.type === "deposit";
                return (
                  <tr key={c.id}>
                    <td>{fmtDate(c.date)}</td>
                    <td>
                      {CURRENCY_FLAG[ccy]} {p?.name}
                    </td>
                    <td>
                      <span className={`badge ${isDeposit ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}>{isDeposit ? "📥 ฝาก" : "📤 ถอน"}</span>
                    </td>
                    <td className={`num ${isDeposit ? "text-pos" : "text-neg"}`}>
                      {isDeposit ? "" : "−"}
                      <Money value={c.amount} currency={ccy} />
                    </td>
                    <td className="num text-muted">
                      {ccy === "THB" ? "" : c.amountThb === null ? <span title="ประมาณจากอัตราปัจจุบัน">≈ {fmt(cashflowThb(c, fx))}</span> : fmt(c.amountThb)}
                    </td>
                    <td>{c.account}</td>
                    <td className="max-w-xs truncate">{c.note}</td>
                    <td>
                      <RowActions href={`/cashflows?edit=${c.id}`} table="cashflows" id={c.id} label={`รายการ ${fmt(c.amount)} วันที่ ${fmtDate(c.date)}`} />
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
