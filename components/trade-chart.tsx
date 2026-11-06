import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtSigned, toneClass } from "@/lib/format";

export type TradeColumn = {
  key: string;
  /** Axis label, e.g. "2026" or "พ.ย." */
  label: string;
  /** Tooltip heading, e.g. "ปี 2026" or "พ.ย. 2026" */
  title: string;
  /** THB bought (incl. fees) and sold (after fees). */
  buy: number;
  sell: number;
  /** Realized P/L (THB) of the sells in this period. */
  realized: number;
  count: number;
};

/**
 * Money spent on buys (green) next to money from sells (red) per period, on one THB axis — the
 * same paired-column form as the cash-flow chart. Only the biggest buy and biggest sell carry a
 * direct label; every column has a tooltip beside the bar's top.
 */
export function TradeChart({
  cols,
  height = 180,
}: {
  cols: TradeColumn[];
  height?: number;
}) {
  if (cols.every((c) => c.count === 0)) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        🛒 ยังไม่มีรายการซื้อขายในช่วงนี้
      </p>
    );
  }

  const max = niceMax(Math.max(...cols.flatMap((c) => [c.buy, c.sell])) * 1.15);
  const ticks = [max, max / 2, 0];
  const topBuy = cols.reduce((a, b) => (b.buy > a.buy ? b : a));
  const topSell = cols.reduce((a, b) => (b.sell > a.sell ? b : a));
  const n = cols.length;

  return (
    <div>
      <div className="flex gap-3">
        <div
          style={{ height }}
          className="relative w-12 shrink-0 text-right text-[11px] text-muted tabular-nums"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - t / max) * 100}%` }}
            >
              {compact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-line" : "border-dashed border-line/60"}`}
                style={{ top: `${(1 - t / max) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {cols.map((c, i) => {
                const tall = Math.max(c.buy, c.sell);
                const side = i < n - 2 ? "left-full ml-2" : "right-full mr-2";
                return (
                  <div
                    key={c.key}
                    tabIndex={0}
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  >
                    <div className="absolute inset-0 rounded-lg transition-colors group-hover:bg-subtle/70 group-focus-visible:bg-subtle/70" />
                    <div className="relative flex h-full w-full max-w-16 items-end justify-center gap-[2px]">
                      {(
                        [
                          ["buy", c.buy, "bg-pos", c === topBuy],
                          ["sell", c.sell, "bg-neg", c === topSell],
                        ] as const
                      ).map(([k, v, bg, label]) => (
                        <div
                          key={k}
                          className={`relative w-1/2 max-w-7 rounded-t-[4px] ${bg}`}
                          style={{
                            height: `${(v / max) * 100}%`,
                            minHeight: v > 0 ? 2 : 0,
                          }}
                        >
                          {label && v > 0 ? (
                            <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums">
                              {compact(v)}
                            </span>
                          ) : null}
                        </div>
                      ))}

                      {/* Tooltip beside the top of the taller bar. */}
                      <div
                        role="tooltip"
                        className={`pointer-events-none absolute z-10 hidden w-52 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg group-hover:block group-focus-visible:block ${side}`}
                        style={{
                          bottom: `${Math.min((tall / max) * 100, 100)}%`,
                          transform: "translateY(100%)",
                        }}
                      >
                        <p className="mb-1.5 font-semibold">{c.title}</p>
                        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                          <dt className="flex items-center gap-1.5 text-muted">
                            <span className="size-2 rounded-sm bg-pos" />
                            ซื้อ
                          </dt>
                          <dd className="text-right font-semibold">
                            {fmt(c.buy)}
                          </dd>
                          <dt className="flex items-center gap-1.5 text-muted">
                            <span className="size-2 rounded-sm bg-neg" />
                            ขาย
                          </dt>
                          <dd className="text-right font-semibold">
                            {fmt(c.sell)}
                          </dd>
                          <dt className="text-muted">กำไรที่ขายแล้ว</dt>
                          <dd
                            className={`text-right ${c.sell > 0 ? toneClass(c.realized) : "text-muted"}`}
                          >
                            {c.sell > 0 ? fmtSigned(c.realized) : "-"}
                          </dd>
                          <dt className="text-muted">จำนวนรายการ</dt>
                          <dd className="text-right">{c.count}</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-[2px] text-center text-xs text-muted tabular-nums">
            {cols.map((c, i) => (
              <span
                key={c.key}
                className={`min-w-0 flex-1 truncate ${i === n - 1 ? "font-semibold text-foreground" : ""}`}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-pos" /> ซื้อ (รวมค่าธรรมเนียม)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-neg" /> ขาย (หักค่าธรรมเนียม)
        </span>
        <span>· ชี้ที่แท่งเพื่อดูรายละเอียด</span>
      </div>
    </div>
  );
}
