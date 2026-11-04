import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtSigned } from "@/lib/format";

export type FlowSeries = {
  id: number;
  name: string;
  emoji: string;
  color: string;
};
export type FlowYear = {
  year: number;
  /** Running capital (THB, all deposits − withdrawals) at year end across the shown portfolios. */
  capital: number;
  /** Per portfolio: fresh money in, returns moved back in, and withdrawals (THB). */
  parts: Record<number, { fresh: number; reinvest: number; withdraw: number }>;
};

/** Reinvested money is the deposit hue, lightened, so the two shades read as one "money in" bar. */
const REINVEST_BG = "color-mix(in oklab, var(--pos) 40%, var(--surface))";

/**
 * Money in and out per year as a pair of columns on one magnitude axis:
 * the deposit column stacks fresh money (dark) under reinvested returns (light), next to the withdrawal column.
 * Only the biggest deposit and biggest withdrawal carry a direct label; the tooltip has the
 * per-portfolio breakdown, the net change in own capital, and the running capital.
 */
export function CashflowChart({
  series,
  years,
  height = 180,
}: {
  series: FlowSeries[];
  years: FlowYear[];
  /** Plot height in px; kept compact so the page fits a laptop screen. */
  height?: number;
}) {
  if (years.length === 0 || series.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        💸 ยังไม่มีรายการฝาก-ถอน
      </p>
    );
  }

  // Fill gaps so a quiet year still shows as an empty slot.
  const byYear = new Map(years.map((y) => [y.year, y]));
  const first = years[0].year;
  const last = years[years.length - 1].year;
  const cols = Array.from({ length: last - first + 1 }, (_, i) => {
    const y = byYear.get(first + i);
    const parts = series
      .map((s) => ({
        s,
        fresh: y?.parts[s.id]?.fresh ?? 0,
        reinvest: y?.parts[s.id]?.reinvest ?? 0,
        withdraw: y?.parts[s.id]?.withdraw ?? 0,
      }))
      .filter((p) => p.fresh || p.reinvest || p.withdraw);
    const total = (k: "fresh" | "reinvest" | "withdraw") =>
      parts.reduce((a, p) => a + p[k], 0);
    const fresh = total("fresh");
    const reinvest = total("reinvest");
    return {
      year: first + i,
      capital: y?.capital ?? null,
      parts,
      fresh,
      reinvest,
      deposit: fresh + reinvest,
      withdraw: total("withdraw"),
    };
  });

  // ~15% headroom so the direct labels above the tallest bars stay inside the plot.
  const max = niceMax(
    Math.max(...cols.map((c) => Math.max(c.deposit, c.withdraw))) * 1.15,
  );
  const ticks = [max, max / 2, 0];
  const pct = (v: number) => (v / max) * 100;

  const biggestIn = cols.reduce((a, b) => (b.deposit > a.deposit ? b : a));
  const biggestOut = cols.reduce((a, b) => (b.withdraw > a.withdraw ? b : a));
  const latest = cols[cols.length - 1];
  const multi = series.length > 1;
  const anyReinvest = cols.some((c) => c.reinvest > 0);

  const label = (text: string) => (
    <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums">
      {text}
    </span>
  );

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
              style={{ top: `${100 - pct(t)}%` }}
            >
              {t === 0 ? "0" : compact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-muted/50" : "border-dashed border-line/60"}`}
                style={{ top: `${100 - pct(t)}%` }}
              />
            ))}

            <div className="absolute inset-0 flex gap-[2px]">
              {cols.map((c, i) => {
                const side = i < cols.length / 2 ? "left-0" : "right-0";
                return (
                  <div
                    key={c.year}
                    tabIndex={0}
                    className="group relative h-full flex-1 outline-none"
                  >
                    <div className="absolute inset-0 rounded-lg transition-colors group-hover:bg-subtle/70 group-focus-visible:bg-subtle/70" />

                    {/* deposit | withdraw pair, 2px apart, anchored to the baseline */}
                    <div className="absolute inset-x-0 bottom-0 flex h-full items-end justify-center gap-[2px] px-[12%]">
                      {/* deposit column: fresh money at the bottom, reinvested returns on top, 2px gap */}
                      <div
                        className="relative flex w-1/2 max-w-6 flex-col-reverse gap-[2px] transition-[filter] group-hover:brightness-110"
                        style={{ height: `${pct(c.deposit)}%` }}
                      >
                        {c.fresh > 0 ? (
                          <div
                            className={`min-h-[2px] bg-pos ${c.reinvest > 0 ? "" : "rounded-t-[4px]"}`}
                            style={{ flexGrow: c.fresh, flexBasis: 0 }}
                          />
                        ) : null}
                        {c.reinvest > 0 ? (
                          <div
                            className="min-h-[2px] rounded-t-[4px]"
                            style={{
                              flexGrow: c.reinvest,
                              flexBasis: 0,
                              background: REINVEST_BG,
                            }}
                          />
                        ) : null}
                        {c === biggestIn && c.deposit > 0
                          ? label(compact(c.deposit))
                          : null}
                      </div>

                      <div
                        className="relative w-1/2 max-w-6 rounded-t-[4px] bg-neg transition-[filter] group-hover:brightness-110"
                        style={{
                          height: `${pct(c.withdraw)}%`,
                          minHeight: c.withdraw > 0 ? 2 : 0,
                        }}
                      >
                        {c === biggestOut && c.withdraw > 0
                          ? label(compact(c.withdraw))
                          : null}
                      </div>
                    </div>

                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute top-2 z-10 w-72 rounded-xl border border-line bg-surface p-3 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${side}`}
                    >
                      <p className="mb-2 font-semibold">ปี {c.year}</p>
                      {c.parts.length ? (
                        <table className="w-full tabular-nums">
                          <thead>
                            <tr className="text-muted">
                              <th className="pb-1 text-left font-normal" />
                              <th className="pb-1 text-right font-normal">
                                เงินใหม่
                              </th>
                              <th className="pb-1 text-right font-normal">
                                นำกลับ
                              </th>
                              <th className="pb-1 text-right font-normal">
                                ถอน
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.parts.map((p) => (
                              <tr key={p.s.id}>
                                <td className="max-w-24 truncate py-0.5">
                                  {multi ? (
                                    <span
                                      className="mr-1.5 inline-block size-2.5 rounded-sm align-middle"
                                      style={{ background: p.s.color }}
                                    />
                                  ) : null}
                                  {p.s.emoji} {p.s.name}
                                </td>
                                <td className="py-0.5 text-right text-pos">
                                  {p.fresh ? fmt(p.fresh, 0) : "-"}
                                </td>
                                <td className="py-0.5 text-right">
                                  {p.reinvest ? fmt(p.reinvest, 0) : "-"}
                                </td>
                                <td className="py-0.5 text-right text-neg">
                                  {p.withdraw ? fmt(p.withdraw, 0) : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-muted">ไม่มีรายการ</p>
                      )}
                      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-line pt-2 tabular-nums">
                        <dt className="text-muted">สุทธิ (ฝาก − ถอน)</dt>
                        <dd
                          className={`text-right font-semibold ${c.deposit - c.withdraw < 0 ? "text-neg" : "text-pos"}`}
                        >
                          {fmtSigned(c.deposit - c.withdraw)}
                        </dd>
                        {c.capital !== null ? (
                          <>
                            <dt className="text-muted">เงินต้นสะสม</dt>
                            <dd className="text-right">{fmt(c.capital)}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-[2px] text-center text-xs text-muted tabular-nums">
            {cols.map((c) => (
              <span
                key={c.year}
                className={`flex-1 ${c === latest ? "font-semibold text-foreground" : ""}`}
              >
                {c.year}
              </span>
            ))}
          </div>

          {/* legend: series names in text so color never carries meaning alone */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-pos" />
              💰 เงินใหม่
            </span>
            {anyReinvest ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ background: REINVEST_BG }}
                />
                🔁 นำกลับมาลงทุน
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-neg" />
              ถอน
            </span>
            <span>💡 ชี้ที่ปีเพื่อดูรายละเอียด</span>
          </div>
        </div>
      </div>
    </div>
  );
}
