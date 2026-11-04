import { Briefcase } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  listCashflows,
  listFxRates,
  listPortfolios,
  listPrices,
  listTrades,
} from "@/lib/data";
import { buildFx, computePositions } from "@/lib/calc";
import { savePriceAction } from "@/app/actions";
import {
  fmt,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSigned,
  toneClass,
  portfolioEmoji,
} from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import {
  AssetBadge,
  Card,
  EmptyRow,
  Money,
  PageHeader,
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
  const fx = buildFx(portfolios, listCashflows(user.id), listFxRates(user.id));
  const { holdings: all } = computePositions(listTrades(user.id), prices);
  const holdings = (
    current ? all.filter((h) => h.portfolioId === current) : all
  ).sort(
    (a, b) =>
      b.marketValue * fx.rateOf(b.portfolioId) -
      a.marketValue * fx.rateOf(a.portfolioId),
  );
  const portById = new Map(portfolios.map((p) => [p.id, p]));
  const updatedAt = new Map(prices.map((p) => [p.symbol, p.updatedAt]));

  const cost = holdings.reduce(
    (s, h) => s + h.costBasis * fx.rateOf(h.portfolioId),
    0,
  );
  const value = holdings.reduce(
    (s, h) => s + h.marketValue * fx.rateOf(h.portfolioId),
    0,
  );
  const missingPrice = holdings.filter((h) => h.marketPrice === null).length;

  return (
    <>
      <PageHeader
        emoji="💼"
        title="หลักทรัพย์ที่ถือ"
        subtitle="คำนวณจากประวัติซื้อขาย · ใส่ราคาล่าสุดเพื่อดูกำไรที่ยังไม่ได้ขาย"
      >
        <PortfolioTabs
          portfolios={portfolios}
          current={current}
          basePath="/holdings"
        />
      </PageHeader>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat emoji="🧮" label="ต้นทุนรวม (฿)" value={fmt(cost)} />
        <Stat
          emoji="🏷️"
          label="มูลค่าตลาด (฿)"
          value={fmt(value)}
          hint={
            missingPrice
              ? `⚠️ ${missingPrice} ตัวยังไม่ใส่ราคา (ใช้ราคาทุน)`
              : undefined
          }
        />
        <Stat
          emoji={value >= cost ? "🚀" : "🥶"}
          label="กำไร/ขาดทุนที่ยังไม่ขาย (฿)"
          value={fmtSigned(value - cost)}
          tone={toneClass(value - cost)}
          hint={cost > 0 ? fmtPct(((value - cost) / cost) * 100) : undefined}
        />
      </div>

      <Card
        title={`${holdings.length} รายการ`}
        icon={<Briefcase className="size-5" />}
      >
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>ชนิด</th>
                <th>พอร์ต</th>
                <th className="num">จำนวน</th>
                <th className="num">ต้นทุนเฉลี่ย</th>
                <th className="num">ต้นทุนรวม</th>
                <th>ราคาล่าสุด</th>
                <th className="num">มูลค่าตลาด</th>
                <th className="num">กำไร/ขาดทุน</th>
              </tr>
            </thead>
            <tbody>
              {holdings.length === 0 ? (
                <EmptyRow
                  cols={9}
                  emoji="🧺"
                  text="ยังไม่มีหลักทรัพย์ บันทึกการซื้อที่หน้า ซื้อ-ขาย"
                />
              ) : null}
              {holdings.map((h) => {
                const ccy = portById.get(h.portfolioId)?.currency ?? "THB";
                return (
                  <tr key={`${h.portfolioId}:${h.symbol}`}>
                    <td className="font-semibold">{h.symbol}</td>
                    <td>
                      <AssetBadge type={h.assetType} />
                    </td>
                    <td>
                      {portfolioEmoji(portById.get(h.portfolioId)!)}{" "}
                      {portById.get(h.portfolioId)?.name}
                    </td>
                    <td className="num">{fmtQty(h.quantity)}</td>
                    <td className="num">{fmtPrice(h.avgCost)}</td>
                    <td className="num">
                      <Money value={h.costBasis} currency={ccy} />
                    </td>
                    <td>
                      <ActionForm
                        action={savePriceAction}
                        submitLabel="บันทึก"
                        className="flex items-center gap-2 [&_.btn-primary]:px-3 [&_.btn-primary]:py-1"
                      >
                        <input type="hidden" name="symbol" value={h.symbol} />
                        <input
                          name="price"
                          inputMode="decimal"
                          defaultValue={h.marketPrice ?? ""}
                          placeholder="ราคา"
                          title={
                            updatedAt.get(h.symbol)
                              ? `อัปเดตเมื่อ ${updatedAt.get(h.symbol)}`
                              : undefined
                          }
                          className="input w-28 py-1"
                        />
                      </ActionForm>
                    </td>
                    <td className="num">
                      <Money value={h.marketValue} currency={ccy} />
                    </td>
                    <td className={`num ${toneClass(h.unrealized)}`}>
                      {h.marketPrice === null ? (
                        <span className="text-muted">ยังไม่ใส่ราคา</span>
                      ) : (
                        <>
                          {fmtSigned(h.unrealized)}{" "}
                          <span className="text-xs">
                            ({fmtPct(h.unrealizedPct)})
                          </span>
                        </>
                      )}
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
