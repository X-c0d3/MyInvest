import type { YearRow } from "@/lib/calc";
import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtPct } from "@/lib/format";

/**
 * Yearly net dividends as columns (one series → one hue, no legend).
 * Only the best and latest years carry a direct label; every column has a hover tooltip.
 */
export function DividendChart({
  years,
  height = 180,
}: {
  years: YearRow[];
  /** Plot height in px; kept compact so the page fits a laptop screen. */
  height?: number;
}) {
  if (years.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        📅 ยังไม่มีข้อมูลปันผล
      </p>
    );
  }

  // Fill gaps so a year with no dividend still shows as an empty slot.
  const byYear = new Map(years.map((y) => [y.year, y]));
  const first = years[0].year;
  const last = years[years.length - 1].year;
  const series = Array.from(
    { length: last - first + 1 },
    (_, i) => byYear.get(first + i) ?? null,
  ).map((y, i) => ({
    year: first + i,
    net: y?.dividendNet ?? 0,
    tax: y?.dividendTax ?? 0,
    yieldPct: y && y.capital > 0 ? y.dividendYieldPct : null,
  }));

  const max = niceMax(Math.max(...series.map((s) => s.net)));
  const best = series.reduce((a, b) => (b.net > a.net ? b : a));
  const latest = series[series.length - 1];
  const ticks = [max, max / 2, 0];

  return (
    <div className="flex gap-3">
      {/* y-axis labels */}
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
          {/* recessive gridlines; baseline slightly stronger */}
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-line" : "border-dashed border-line/60"}`}
              style={{ top: `${(1 - t / max) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((s, i) => {
              const h = (s.net / max) * 100;
              const prev = series[i - 1];
              const change =
                prev && prev.net > 0
                  ? ((s.net - prev.net) / prev.net) * 100
                  : null;
              const labeled = s === best || s === latest;
              const tooltipSide = i < series.length / 2 ? "left-0" : "right-0";
              return (
                <div
                  key={s.year}
                  tabIndex={0}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {/* hover band: bigger hit target than the bar */}
                  <div className="absolute inset-0 rounded-lg transition-colors group-hover:bg-subtle/70 group-focus-visible:bg-subtle/70" />
                  <div
                    className="relative w-full max-w-12 rounded-t-[4px] bg-accent transition-[filter] group-hover:brightness-110"
                    style={{ height: `${h}%`, minHeight: s.net > 0 ? 2 : 0 }}
                  >
                    {labeled ? (
                      <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold whitespace-nowrap tabular-nums">
                        {s === best ? "🏆 " : ""}
                        {compact(s.net)}
                      </span>
                    ) : null}
                  </div>

                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute top-2 z-10 w-44 rounded-xl border border-line bg-surface p-3 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${tooltipSide}`}
                  >
                    <p className="mb-1.5 font-semibold">
                      ปี {s.year} {s === best ? "🏆" : ""}
                    </p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                      <dt className="text-muted">ปันผลสุทธิ</dt>
                      <dd className="text-right font-semibold">{fmt(s.net)}</dd>
                      <dt className="text-muted">ภาษีที่ถูกหัก</dt>
                      <dd className="text-right">{fmt(s.tax)}</dd>
                      {s.yieldPct !== null ? (
                        <>
                          <dt className="text-muted">เทียบเงินต้น</dt>
                          <dd className="text-right">{fmtPct(s.yieldPct)}</dd>
                        </>
                      ) : null}
                      {change !== null ? (
                        <>
                          <dt className="text-muted">เทียบปีก่อน</dt>
                          <dd
                            className={`text-right ${change >= 0 ? "text-pos" : "text-neg"}`}
                          >
                            {change >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(change))}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* x-axis */}
        <div className="mt-2 flex gap-[2px] text-center text-xs text-muted tabular-nums">
          {series.map((s) => (
            <span
              key={s.year}
              className={`flex-1 ${s === latest ? "font-semibold text-foreground" : ""}`}
            >
              {s.year}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
