import { ArrowRightLeft, FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  CURRENCIES,
  listCashflows,
  listFxRates,
  listPortfolios,
} from "@/lib/data";
import { buildFx } from "@/lib/calc";
import { saveFxRateAction, savePortfolioAction } from "@/app/actions";
import { CURRENCY_FLAG, fmt } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import {
  Card,
  EmptyRow,
  Field,
  PageHeader,
  RowActions,
  pickEdit,
  NewButton,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

const SOURCE_LABEL = {
  manual: "✍️ ตั้งเอง",
  average: "🧮 เฉลี่ยจากยอดที่โอน",
  missing: "⚠️ ยังไม่มีอัตรา",
  base: "",
} as const;

export default async function PortfoliosPage({
  searchParams,
}: PageProps<"/portfolios">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const editing = portfolios.find((p) => p.id === pickEdit(sp.edit));
  const rates = listFxRates(user.id);
  const fx = buildFx(portfolios, listCashflows(user.id), rates);
  const updatedAt = new Map(rates.map((r) => [r.currency, r.updatedAt]));
  const foreign = [
    ...new Set(portfolios.map((p) => p.currency).filter((c) => c !== "THB")),
  ];

  return (
    <>
      <PageHeader
        emoji="🗂️"
        title="พอร์ต & ค่าเงิน"
        subtitle="แยกพอร์ตตามตลาดหรือโบรกเกอร์ เช่น หุ้นไทย, หุ้น US (Dime), Crypto (Bitkub)"
      >
        <NewButton basePath="/portfolios" label="เพิ่มพอร์ต" />
      </PageHeader>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <FormModal
          open={!!editing || sp.new === "1"}
          emoji="🗂️"
          title={editing ? "แก้ไขพอร์ต" : "เพิ่มพอร์ต"}
          closeHref={"/portfolios"}
        >
          <ActionForm
            key={editing?.id ?? "new"}
            action={savePortfolioAction}
            editId={editing?.id}
            cancelHref={"/portfolios"}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="ชื่อพอร์ต">
              <input
                name="name"
                defaultValue={editing?.name}
                placeholder="เช่น หุ้น US"
                className="input"
                required
              />
            </Field>
            <Field label="ประเภท">
              <select
                name="kind"
                defaultValue={editing?.kind ?? "stock"}
                className="input"
              >
                <option value="stock">🏢 หุ้น / ETF</option>
                <option value="crypto">🪙 Crypto</option>
              </select>
            </Field>
            <Field
              label="สกุลเงิน"
              hint="ราคาซื้อขาย ปันผล และเงินฝากของพอร์ตนี้ใช้สกุลนี้"
            >
              <select
                name="currency"
                defaultValue={editing?.currency ?? "THB"}
                className="input"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_FLAG[c]} {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="ปันผลจ่ายไปที่"
              hint="โบรกหุ้นไทยส่วนใหญ่โอนปันผลเข้าบัญชีธนาคาร ถ้านำกลับมาลงทุน ให้บันทึกเป็นเงินฝาก “ปันผลนำกลับ”"
            >
              <select
                name="dividendsTo"
                defaultValue={editing?.dividendsToCash ? "cash" : "bank"}
                className="input"
              >
                <option value="bank">🏦 บัญชีธนาคาร (นอกพอร์ต)</option>
                <option value="cash">💼 เงินสดในพอร์ต</option>
              </select>
            </Field>
            <Field label="หมายเหตุ">
              <input
                name="note"
                defaultValue={editing?.note ?? ""}
                className="input"
              />
            </Field>
          </ActionForm>
        </FormModal>

        <Card
          title="อัตราแลกเปลี่ยน"
          icon={<ArrowRightLeft className="size-5" />}
        >
          {foreign.length === 0 ? (
            <p className="text-sm text-muted">
              🇹🇭 ทุกพอร์ตเป็นเงินบาท ยังไม่ต้องตั้งค่า
              เมื่อเพิ่มพอร์ตสกุลเงินอื่น เช่น USD จะตั้งอัตราได้ที่นี่
            </p>
          ) : (
            <ul className="space-y-4">
              {foreign.map((ccy) => (
                <li key={ccy} className="rounded-xl bg-surface-2 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">
                      {CURRENCY_FLAG[ccy]} 1 {ccy} ={" "}
                      {fx.rate(ccy) ? fmt(fx.rate(ccy), 4) : "?"} ฿
                    </span>
                    <span
                      className="text-xs text-muted"
                      title={
                        updatedAt.get(ccy)
                          ? `อัปเดตเมื่อ ${updatedAt.get(ccy)}`
                          : undefined
                      }
                    >
                      {SOURCE_LABEL[fx.source(ccy)]}
                    </span>
                  </div>
                  <ActionForm
                    action={saveFxRateAction}
                    submitLabel="บันทึก"
                    className="flex items-center gap-2 [&_.btn-primary]:px-3 [&_.btn-primary]:py-1.5"
                  >
                    <input type="hidden" name="currency" value={ccy} />
                    <input
                      name="rate"
                      inputMode="decimal"
                      defaultValue={
                        fx.source(ccy) === "manual" ? fx.rate(ccy) : ""
                      }
                      placeholder="บาทต่อ 1 หน่วย"
                      className="input flex-1 py-1.5"
                    />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">
            💡 ใช้แปลงมูลค่าปัจจุบันเป็นบาท ถ้าไม่ได้ตั้ง
            ระบบจะใช้อัตราเฉลี่ยจากยอดบาทที่คุณโอนเข้าพอร์ตนั้น
          </p>
        </Card>
      </div>

      <Card title="พอร์ตทั้งหมด" icon={<FolderOpen className="size-5" />}>
        <table className="table">
          <thead>
            <tr>
              <th>ชื่อพอร์ต</th>
              <th>ประเภท</th>
              <th>สกุลเงิน</th>
              <th>ปันผลจ่ายไปที่</th>
              <th>หมายเหตุ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {portfolios.length === 0 ? <EmptyRow cols={6} emoji="📂" /> : null}
            {portfolios.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td>{p.kind === "stock" ? "🏢 หุ้น / ETF" : "🪙 Crypto"}</td>
                <td>
                  {CURRENCY_FLAG[p.currency]} {p.currency}
                </td>
                <td className="text-muted">
                  {p.kind === "crypto"
                    ? "-"
                    : p.dividendsToCash
                      ? "💼 เงินสดในพอร์ต"
                      : "🏦 บัญชีธนาคาร"}
                </td>
                <td>{p.note}</td>
                <td>
                  <RowActions
                    href={`/portfolios?edit=${p.id}`}
                    table="portfolios"
                    id={p.id}
                    label={`พอร์ต "${p.name}" และรายการทั้งหมดในพอร์ตนี้`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
