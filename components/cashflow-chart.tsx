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
  /** Running net capital (THB) at year end across the shown portfolios. */
  capital: number;
  parts: Record<number, { deposit: number; withdraw: number }>;
};

/**
 * Deposits and withdrawals per year as a pair of columns on one magnitude axis.
 * Only the biggest deposit and biggest withdrawal carry a direct label; the tooltip
 * has the per-portfolio breakdown, the net, and the running capital.
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
        deposit: y?.parts[s.id]?.deposit ?? 0,
        withdraw: y?.parts[s.id]?.withdraw ?? 0,
      }))
      .filter((p) => p.deposit || p.withdraw);
    const deposit = parts.reduce((a, p) => a + p.deposit, 0);
    const withdraw = parts.reduce((a, p) => a + p.withdraw, 0);
    return {
      year: first + i,
      capital: y?.capital ?? null,
      parts,
      deposit,
      withdraw,
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

  const bar = (value: number, cls: string, label: string | null) => (
    <div
      className={`relative w-1/2 max-w-6 rounded-t-[4px] transition-[filter] group-hover:brightness-110 ${cls}`}
      style={{ height: `${pct(value)}%`, minHeight: value > 0 ? 2 : 0 }}
    >
      {label ? (
        <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums">
          {label}
        </span>
      ) : null}
    </div>
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
                      {bar(
                        c.deposit,
                        "bg-pos",
                        c === biggestIn && c.deposit > 0
                          ? compact(c.deposit)
                          : null,
                      )}
                      {bar(
                        c.withdraw,
                        "bg-neg",
                        c === biggestOut && c.withdraw > 0
                          ? compact(c.withdraw)
                          : null,
                      )}
                    </div>

                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute top-2 z-10 w-64 rounded-xl border border-line bg-surface p-3 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${side}`}
                    >
                      <p className="mb-2 font-semibold">ปี {c.year}</p>
                      {c.parts.length ? (
                        <table className="w-full tabular-nums">
                          <thead>
                            <tr className="text-muted">
                              <th className="pb-1 text-left font-normal" />
                              <th className="pb-1 text-right font-normal">
                                ฝาก
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
                                  {p.deposit ? fmt(p.deposit, 0) : "-"}
                                </td>
                                <td className="py-0.5 text-right text-neg">
                                  {p.withdraw ? fmt(p.withdraw, 0) : "-"}
                                </td>
                              </tr>
                            ))}
                            {c.parts.length > 1 ? (
                              <tr className="border-t border-line font-semibold">
                                <td className="pt-1">รวม</td>
                                <td className="pt-1 text-right text-pos">
                                  {fmt(c.deposit, 0)}
                                </td>
                                <td className="pt-1 text-right text-neg">
                                  {c.withdraw ? fmt(c.withdraw, 0) : "-"}
                                </td>
                              </tr>
                            ) : null}
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
              ฝาก
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-neg" />
              ถอน
            </span>
            <span>💡 ชี้ที่ปีเพื่อดูยอดแยกพอร์ตและยอดสุทธิ</span>
          </div>
        </div>
      </div>
    </div>
  );
}
