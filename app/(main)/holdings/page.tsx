import Link from "next/link";
import { Banknote, Briefcase, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listFxRates,
  listPortfolios,
  listPositions,
  listPrices,
  listTrades,
} from "@/lib/data";
import { buildFx, computePositions } from "@/lib/calc";
import { saveCashBalanceAction, savePositionAction } from "@/app/actions";
import {
  fmt,
  fmtDate,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSigned,
  portfolioEmoji,
  toneClass,
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { FormModal } from "@/components/form-modal";
import {
  AssetBadge,
  Card,
  EmptyRow,
  Field,
  Money,
  NewButton,
  PageHeader,
  PortfolioSelect,
  PortfolioTabs,
  pickPortfolio,
  Stat,
} from "@/components/ui";

// Per-user data read from SQLite on every request; blocking on it is fast and simpler than streaming.
export const instant = false;

export default async function HoldingsPage({
  searchParams,
}: PageProps<"/holdings">) {
  const user = await requireUser();
  const sp = await searchParams;
  const portfolios = listPortfolios(user.id);
  const current = pickPortfolio(portfolios, sp.p);
  const prices = listPrices(user.id);
  const cashflows = listCashflows(user.id);
  const trades = listTrades(user.id);
  const fx = buildFx(portfolios, cashflows, listFxRates(user.id));
  const { holdings: all } = computePositions(
    trades,
    prices,
    listPositions(user.id),
  );
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  const thb = (portfolioId: number, n: number) => n * fx.rateOf(portfolioId);

  const holdings = (
    current ? all.filter((h) => h.portfolioId === current) : all
  ).sort(
    (a, b) =>
      thb(b.portfolioId, b.marketValue) - thb(a.portfolioId, a.marketValue),
  );
  const cost = holdings.reduce(
    (s, h) => s + thb(h.portfolioId, h.costBasis),
    0,
  );
  const value = holdings.reduce(
    (s, h) => s + thb(h.portfolioId, h.marketValue),
    0,
  );
  const pl = value - cost;
  const showPortfolio = !current && portfolios.length > 1;

  // Edit modal: ?edit=<portfolioId>:<symbol>, or ?new=1 to add a holding.
  const editKey = typeof sp.edit === "string" ? sp.edit : null;
  const editing = editKey
    ? all.find((h) => `${h.portfolioId}:${h.symbol}` === editKey)
    : undefined;
  const listHref = `/holdings${current ? `?p=${current}` : ""}`;
  const editHref = (h: (typeof all)[number]) =>
    `/holdings?${current ? `p=${current}&` : ""}edit=${encodeURIComponent(`${h.portfolioId}:${h.symbol}`)}`;

  // Cash card: portfolios with any activity (or cash already entered).
  const cashPortfolios = portfolios.filter(
    (p) =>
      (!current || p.id === current) &&
      (p.cashBalance !== null ||
        cashflows.some((c) => c.portfolioId === p.id) ||
        all.some((h) => h.portfolioId === p.id)),
  );

  return (
    <>
      <PageHeader
        emoji="💼"
        title="หลักทรัพย์ที่ถือ"
        subtitle="หุ้นและเหรียญที่ถืออยู่ตอนนี้ กด ✏️ เพื่อใส่จำนวนและต้นทุนเฉลี่ยให้ตรงกับแอปโบรก"
      >
        <div className="flex flex-wrap items-center gap-3">
          <PortfolioTabs
            portfolios={portfolios}
            current={current}
            basePath="/holdings"
          />
          <NewButton
            basePath="/holdings"
            href={`/holdings?new=1${current ? `&p=${current}` : ""}`}
            label="เพิ่มหุ้น"
          />
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat emoji="🧮" label="ต้นทุนรวม (฿)" value={fmt(cost)} />
        <Stat emoji="🏷️" label="มูลค่าตามราคาตลาด (฿)" value={fmt(value)} />
        <Stat
          emoji={pl >= 0 ? "🚀" : "📉"}
          label="กำไร/ขาดทุน (฿)"
          value={fmtSigned(pl)}
          tone={toneClass(pl)}
          hint={cost > 0 ? fmtPct((pl / cost) * 100) : undefined}
        />
      </div>

      <Card
        title={`${holdings.length} รายการ`}
        icon={<Briefcase className="size-5" />}
        className="mb-4"
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>หุ้น / เหรียญ</th>
                {showPortfolio ? <th>พอร์ต</th> : null}
                <th className="num">จำนวน</th>
                <th className="num">ต้นทุนเฉลี่ย</th>
                <th className="num">ราคาล่าสุด</th>
                <th className="num">ต้นทุนรวม</th>
                <th className="num">มูลค่า</th>
                <th className="num">กำไร/ขาดทุน</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holdings.length === 0 ? (
                <EmptyRow
                  cols={9}
                  emoji="🧺"
                  text="ยังไม่มีหุ้น กด “เพิ่มหุ้น” แล้วใส่ตามแอปโบรก"
                />
              ) : null}
              {holdings.map((h) => {
                const ccy = portById.get(h.portfolioId)?.currency ?? "THB";
                const p = portById.get(h.portfolioId);
                return (
                  <tr key={`${h.portfolioId}:${h.symbol}`}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{h.symbol}</span>
                        <AssetBadge type={h.assetType} />
                      </span>
                    </td>
                    {showPortfolio ? (
                      <td>
                        {p ? portfolioEmoji(p) : ""} {p?.name}
                      </td>
                    ) : null}
                    <td className="num">{fmtQty(h.quantity)}</td>
                    <td className="num">{fmtPrice(h.avgCost)}</td>
                    <td className="num">
                      {h.marketPrice === null ? (
                        <span className="text-muted">-</span>
                      ) : (
                        fmtPrice(h.marketPrice)
                      )}
                    </td>
                    <td className="num">
                      <Money value={h.costBasis} currency={ccy} />
                    </td>
                    <td className="num font-medium">
                      <Money value={h.marketValue} currency={ccy} />
                    </td>
                    <td
                      className={`num font-semibold ${toneClass(h.unrealized)}`}
                    >
                      {h.marketPrice === null ? (
                        <span className="font-normal text-muted">
                          ใส่ราคาล่าสุด
                        </span>
                      ) : (
                        <>
                          {fmtSigned(h.unrealized)}{" "}
                          <span className="text-xs">
                            ({fmtPct(h.unrealizedPct)})
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="row-actions flex justify-end">
                        <Link
                          href={editHref(h)}
                          scroll={false}
                          className="icon-btn"
                          title="แก้ไข"
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">แก้ไข</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {holdings.length > 1 ? (
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2.5">รวม (฿)</td>
                  {showPortfolio ? <td /> : null}
                  <td />
                  <td />
                  <td />
                  <td className="num px-3 py-2.5">{fmt(cost)}</td>
                  <td className="num px-3 py-2.5">{fmt(value)}</td>
                  <td className={`num px-3 py-2.5 ${toneClass(pl)}`}>
                    {fmtSigned(pl)}{" "}
                    {cost > 0 ? (
                      <span className="text-xs">
                        ({fmtPct((pl / cost) * 100)})
                      </span>
                    ) : null}
                  </td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>

      <Card
        title="เงินสดในโบรก"
        icon={<Banknote className="size-5" />}
        action={
          <span className="text-xs text-muted">
            ดูยอดจากแอปโบรก แล้วใส่ที่นี่
          </span>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {cashPortfolios.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 ${p.cashBalance === null ? "border-amber-500/40 bg-warn-soft" : "border-line bg-surface-2"}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">
                  {portfolioEmoji(p)} {p.name}
                </p>
                <span className="text-xs text-muted">
                  {p.cashBalance === null
                    ? "⚠️ ยังไม่ได้ใส่"
                    : `อัปเดต ${fmtDate(p.cashUpdatedAt?.slice(0, 10) ?? null)}`}
                </span>
              </div>
              <ActionForm
                action={saveCashBalanceAction}
                submitLabel="บันทึก"
                className="flex items-center gap-2 [&_.btn-primary]:px-3 [&_.btn-primary]:py-1.5"
              >
                <input type="hidden" name="portfolioId" value={p.id} />
                <input
                  name="cash"
                  inputMode="decimal"
                  defaultValue={p.cashBalance ?? ""}
                  placeholder={`เงินสด (${p.currency})`}
                  className="input flex-1 py-1.5"
                />
              </ActionForm>
            </div>
          ))}
        </div>
      </Card>

      <FormModal
        open={!!editing || sp.new === "1"}
        emoji="💼"
        title={editing ? `แก้ไข ${editing.symbol}` : "เพิ่มหุ้น / เหรียญ"}
        closeHref={listHref}
      >
        <p className="mb-4 rounded-xl bg-subtle px-3 py-2 text-sm text-muted">
          💡 ใส่จำนวนและต้นทุนเฉลี่ยตามที่แอปโบรกแสดง ถ้าซื้อหรือขายเพิ่มทีหลัง
          ให้บันทึกในหน้า ซื้อ-ขาย แอปจะคำนวณต่อให้เอง
        </p>
        <ActionForm
          key={editKey ?? "new"}
          action={savePositionAction}
          cancelHref={listHref}
          submitLabel="บันทึก"
        >
          {editing ? (
            <>
              <input
                type="hidden"
                name="portfolioId"
                value={editing.portfolioId}
              />
              <input type="hidden" name="symbol" value={editing.symbol} />
            </>
          ) : (
            <>
              <Field label="พอร์ต">
                <PortfolioSelect
                  portfolios={portfolios}
                  defaultValue={current ?? undefined}
                />
              </Field>
              <Field label="ชื่อย่อ (Symbol)">
                <input
                  name="symbol"
                  placeholder="เช่น JAS, VOO, BTC"
                  className="input uppercase"
                  required
                />
              </Field>
            </>
          )}
          <Field label="ชนิด">
            <select
              name="assetType"
              defaultValue={editing?.assetType ?? "stock"}
              className="input"
            >
              <option value="stock">🏢 หุ้น</option>
              <option value="etf">🧺 ETF</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </Field>
          <Field label="จำนวน">
            <input
              name="quantity"
              inputMode="decimal"
              defaultValue={editing?.quantity}
              className="input"
              required
            />
          </Field>
          <Field label="ต้นทุนเฉลี่ย (Avg Cost)">
            <input
              name="avgCost"
              inputMode="decimal"
              defaultValue={editing ? Number(editing.avgCost.toFixed(6)) : ""}
              className="input"
              required
            />
          </Field>
          <Field label="ราคาล่าสุด (Mkt Price)">
            <input
              name="price"
              inputMode="decimal"
              defaultValue={editing?.marketPrice ?? ""}
              placeholder="ไม่บังคับ"
              className="input"
            />
          </Field>
        </ActionForm>
      </FormModal>
    </>
  );
}
