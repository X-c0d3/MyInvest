import type { YearRow } from "@/lib/calc";
import { compact, niceMax } from "@/lib/chart";
import { fmt, fmtPct, fmtSigned } from "@/lib/format";

/**
 * เงินต้นสะสม (capital incl. compounding) at each year end as one line with a soft area.
 * One series, so no legend: the card title names it. Only the peak and the latest year carry a
 * direct label; every year has a hover/focus column with a crosshair and a tooltip.
 */
export function GrowthChart({
  years,
  height = 180,
}: {
  /** Oldest first. */
  years: YearRow[];
  height?: number;
}) {
  if (years.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        📈 ยังไม่มีข้อมูลรายปี
      </p>
    );
  }

  const max = niceMax(Math.max(...years.map((y) => y.capital)) * 1.15);
  const ticks = [max, max / 2, 0];
  const n = years.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => (1 - Math.max(v, 0) / max) * 100;
  const line = years.map((r, i) => `${x(i)},${y(r.capital)}`).join(" ");
  const area = `${x(0)},100 ${line} ${x(n - 1)},100`;
  const peak = years.reduce((a, b) => (b.capital > a.capital ? b : a));
  const latest = years[n - 1];

  return (
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

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            <polygon
              points={area}
              fill="color-mix(in oklab, var(--accent) 14%, transparent)"
            />
            <polyline
              points={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Hover columns: crosshair, marker and tooltip per year. */}
          <div className="absolute inset-0 flex">
            {years.map((r, i) => {
              const labeled = r === peak || r === latest;
              const side = i < n / 2 ? "left-0" : "right-0";
              return (
                <div
                  key={r.year}
                  tabIndex={0}
                  className="group relative h-full flex-1 outline-none"
                >
                  <div className="absolute inset-y-0 left-1/2 hidden border-l border-line group-hover:block group-focus-visible:block" />
                  <span
                    className={`absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface transition-transform group-hover:scale-125 ${labeled ? "" : "opacity-70"}`}
                    style={{ top: `${y(r.capital)}%` }}
                  />
                  {labeled ? (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold whitespace-nowrap tabular-nums"
                      style={{ top: `calc(${y(r.capital)}% - 1.5rem)` }}
                    >
                      {r === peak && r !== latest ? "🏔️ " : ""}
                      {compact(r.capital)}
                    </span>
                  ) : null}

                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute top-2 z-10 hidden w-52 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg group-hover:block group-focus-visible:block ${side}`}
                  >
                    <p className="mb-1.5 font-semibold">ปี {r.year}</p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                      <dt className="text-muted">เงินต้นสะสม</dt>
                      <dd className="text-right font-semibold">
                        {fmt(r.capital)}
                      </dd>
                      <dt className="text-muted">เงินเก็บสุทธิปีนี้</dt>
                      <dd
                        className={`text-right ${r.netDeposit < 0 ? "text-neg" : ""}`}
                      >
                        {fmtSigned(r.netDeposit)}
                      </dd>
                      <dt className="text-muted">ปันผลสุทธิ</dt>
                      <dd className="text-right">{fmt(r.dividendNet)}</dd>
                      <dt className="text-muted">ผลตอบแทน</dt>
                      <dd className="text-right">{fmtPct(r.returnPct)}</dd>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex text-center text-xs text-muted tabular-nums">
          {years.map((r) => (
            <span
              key={r.year}
              className={`min-w-0 flex-1 ${r === latest ? "font-semibold text-foreground" : ""}`}
            >
              {/* Phones: short years so nine labels fit side by side. */}
              <span className="sm:hidden">’{String(r.year).slice(2)}</span>
              <span className="hidden sm:inline">{r.year}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
