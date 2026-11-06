import type { YearRow } from "@/lib/calc";
import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtPct } from "@/lib/format";

export type DividendStack = {
  key: string;
  label: string;
  color: string;
};

/**
 * Yearly net dividends as columns, each split by paying stock: the top payers keep fixed colors
 * by overall rank (biggest at the bottom) and the rest fold into "อื่นๆ", with a legend.
 * Only the best and latest years carry an amount label; every column has a tooltip beside the
 * bar's top with the per-stock breakdown.
 */
export function DividendChart({
  years,
  capital,
  stacks,
  parts,
  view = "bar",
  height = 180,
}: {
  /** "bar": stacked by stock. "line": the yearly total as one line (one series, no legend). */
  view?: "bar" | "line";
  years: YearRow[];
  /** Current capital of the paying portfolios; each year's % = that year's dividend ÷ this. */
  capital: number;
  /** Bar segments, biggest payer first (drawn at the bottom); "อื่นๆ" last. */
  stacks: DividendStack[];
  /** Net dividend (THB) per year per stack key. */
  parts: Record<number, Record<string, number>>;
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
    .map((y, i) => {
      const year = first + i;
      const segs = stacks
        .map((st) => ({ ...st, value: parts[year]?.[st.key] ?? 0 }))
        .filter((x) => x.value > 0);
      return {
        year,
        net: y?.dividendNet ?? 0,
        tax: y?.dividendTax ?? 0,
        segs,
      };
    })
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
  const line = series.map((s, i) => ({
    x: ((i + 0.5) / series.length) * 100,
    y: (1 - s.net / max) * 100,
  }));

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

          {view === "line" ? (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              aria-hidden
            >
              <polygon
                points={`${line[0].x},100 ${line.map((p) => `${p.x},${p.y}`).join(" ")} ${line[line.length - 1].x},100`}
                fill="color-mix(in oklab, var(--accent) 14%, transparent)"
              />
              <polyline
                points={line.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((s, i) => {
              const h = (s.net / max) * 100;
              const labeled = s === best || s === latest;
              // Tooltip beside the bar's top: to the right, or to the left for the last columns.
              const tooltipSide =
                i < series.length - 2 ? "left-full ml-2" : "right-full mr-2";
              return (
                <div
                  key={s.year}
                  tabIndex={0}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {/* hover band: bigger hit target than the bar */}
                  <div className="absolute inset-0 rounded-lg transition-colors group-hover:bg-subtle/70 group-focus-visible:bg-subtle/70" />
                  <div
                    className="relative flex w-full max-w-12 flex-col-reverse gap-[2px]"
                    style={{ height: `${h}%`, minHeight: s.net > 0 ? 2 : 0 }}
                  >
                    {view === "line" ? (
                      <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface transition-transform group-hover:scale-125" />
                    ) : null}
                    {(view === "bar" ? s.segs : []).map((seg, si) => (
                      <div
                        key={seg.key}
                        className={`transition-[filter] group-hover:brightness-110 ${si === s.segs.length - 1 ? "rounded-t-[4px]" : ""}`}
                        style={{
                          flexGrow: seg.value,
                          flexBasis: 0,
                          minHeight: 2,
                          background: seg.color,
                        }}
                      />
                    ))}

                    {/* % of capital on every bar; the amount only on the best and latest years */}
                    {s.net > 0 ? (
                      <span
                        className={`absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center leading-tight whitespace-nowrap tabular-nums ${view === "line" ? "mb-2" : "mb-1"}`}
                      >
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

                    <div
                      role="tooltip"
                      className={`pointer-events-none absolute top-0 z-10 hidden w-52 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg group-hover:block group-focus-visible:block ${tooltipSide}`}
                    >
                      <p className="mb-1.5 font-semibold">
                        ปี {s.year} {s === best ? "🏆" : ""}
                      </p>
                      {s.segs.length > 0 ? (
                        <ul className="mb-2 space-y-0.5 border-b border-line pb-2 tabular-nums">
                          {[...s.segs].reverse().map((seg) => (
                            <li
                              key={seg.key}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="size-2 shrink-0 rounded-sm"
                                style={{ background: seg.color }}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {seg.label}
                              </span>
                              <span>{fmt(seg.value)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                        <dt className="text-muted">ปันผลสุทธิ</dt>
                        <dd className="text-right font-semibold">
                          {fmt(s.net)}
                        </dd>
                        <dt className="text-muted">ภาษีที่ถูกหัก</dt>
                        <dd className="text-right">{fmt(s.tax)}</dd>
                        {capital > 0 ? (
                          <>
                            <dt className="text-muted">คิดเป็น % เงินต้น</dt>
                            <dd className="text-right">{pct(s.net)}</dd>
                          </>
                        ) : null}
                        {s.change !== null ? (
                          <>
                            <dt className="text-muted">เทียบปีก่อน</dt>
                            <dd
                              className={`text-right ${s.change >= 0 ? "text-pos" : "text-neg"}`}
                            >
                              {s.change >= 0 ? "▲" : "▼"}{" "}
                              {fmtPct(Math.abs(s.change))}
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(view === "bar" ? stacks : []).map((st) => (
              <span key={st.key} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ background: st.color }}
                />
                {st.label}
              </span>
            ))}
          </span>
          <span>% = ปันผลของปีนั้น ÷ เงินต้นปัจจุบัน {fmt(capital)} ฿</span>
        </div>
      </div>
    </div>
  );
}
