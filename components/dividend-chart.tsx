import type { YearRow } from "@/lib/calc";
import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtPct } from "@/lib/format";

/**
 * Yearly net dividends as columns (one series → one hue, no legend).
 * Only the best and latest years carry a direct label; every column has a hover tooltip.
 */
export function DividendChart({
  years,
  capital,
  height = 180,
}: {
  years: YearRow[];
  /** Current capital of the paying portfolios; each year's % = that year's dividend ÷ this. */
  capital: number;
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
  )
    .map((y, i) => ({
      year: first + i,
      net: y?.dividendNet ?? 0,
      tax: y?.dividendTax ?? 0,
    }))
    // Change vs the previous year; null when there is nothing to compare against.
    .map((s, i, all) => {
      const prev = all[i - 1];
      return {
        ...s,
        change:
          prev && prev.net > 0 ? ((s.net - prev.net) / prev.net) * 100 : null,
      };
    });

  // Headroom so the labels above the tallest bar stay inside the plot.
  const max = niceMax(Math.max(...series.map((s) => s.net)) * 1.25);
  const pct = (net: number) =>
    capital > 0 ? fmtPct((net / capital) * 100) : null;
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
              const change = s.change;
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
                    {/* % of capital on every bar; the amount only on the best and latest years */}
                    {s.net > 0 ? (
                      <span className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center leading-tight whitespace-nowrap tabular-nums">
                        {labeled ? (
                          <span className="text-xs font-semibold">
                            {s === best ? "🏆 " : ""}
                            {compact(s.net)}
                          </span>
                        ) : null}
                        {pct(s.net) ? (
                          <span className="text-[11px] font-medium text-muted">
                            {pct(s.net)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute top-2 z-10 w-44 rounded-xl border border-line bg-surface hidden max-w-[calc(100vw-3rem)] p-3 text-xs shadow-lg group-hover:block group-focus-visible:block ${tooltipSide}`}
                  >
                    <p className="mb-1.5 font-semibold">
                      ปี {s.year} {s === best ? "🏆" : ""}
                    </p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                      <dt className="text-muted">ปันผลสุทธิ</dt>
                      <dd className="text-right font-semibold">{fmt(s.net)}</dd>
                      <dt className="text-muted">ภาษีที่ถูกหัก</dt>
                      <dd className="text-right">{fmt(s.tax)}</dd>
                      {capital > 0 ? (
                        <>
                          <dt className="text-muted">คิดเป็น % เงินต้น</dt>
                          <dd className="text-right">{pct(s.net)}</dd>
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
        <p className="mt-1 text-right text-[11px] text-muted">
          % = ปันผลของปีนั้น ÷ เงินต้นปัจจุบัน {fmt(capital)} ฿
        </p>
      </div>
    </div>
  );
}
