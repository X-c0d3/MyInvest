import { ListOrdered } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listPortfolios, listPrices, listTrades } from "@/lib/data";
import { computePositions } from "@/lib/calc";
import { saveTradeAction } from "@/app/actions";
import {
  fmtDate,
  fmtPrice,
  fmtQty,
  fmtSigned,
  toneClass,
  portfolioEmoji,
} from "@/lib/format";
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
} from "@/components/ui";

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
  const { realized } = computePositions(all, listPrices(user.id));
  const pnlByTrade = new Map(realized.map((r) => [r.tradeId, r.pnl]));
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
            <input
              name="symbol"
              defaultValue={editing?.symbol}
              placeholder="เช่น IRPC, VOO, AAPL, BTC"
              className="input uppercase"
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
      </FormModal>

      <Card title="ประวัติ" icon={<ListOrdered className="size-5" />}>
        <div className="overflow-x-auto">
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
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td className="font-semibold">{t.symbol}</td>
                    <td>
                      <AssetBadge type={t.assetType} />
                    </td>
                    <td>
                      <span
                        className={`badge ${t.side === "buy" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                      >
                        {t.side === "buy" ? "BUY" : "SELL"}
                      </span>
                    </td>
                    <td>
                      {p ? portfolioEmoji(p) : ""} {p?.name}
                    </td>
                    <td className="num">{fmtQty(t.quantity)}</td>
                    <td className="num">{fmtPrice(t.price)}</td>
                    <td className="num text-muted">{fmtPrice(t.fee)}</td>
                    <td className="num">
                      <Money value={total} currency={ccy} />
                    </td>
                    <td
                      className={`num ${pnl === undefined ? "text-muted" : toneClass(pnl)}`}
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
                    <td>{t.broker}</td>
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
