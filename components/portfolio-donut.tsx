import { compact } from "@/lib/chart";
import { fmt, fmtPct } from "@/lib/format";

export type DonutSlice = {
  id: number;
  emoji: string;
  name: string;
  /** Value in THB. */
  value: number;
  /** Portfolio color from seriesColor(), so it matches the other charts. */
  color: string;
};

const R = 42;
/** Surface gap between slices, in pathLength units (the ring is 100 long). */
const GAP = 1.2;

/**
 * Share of total value per portfolio: a ring with the total in the middle and a legend that
 * carries every name, amount and percent, so identity never depends on color alone.
 */
export function PortfolioDonut({ slices }: { slices: DonutSlice[] }) {
  const parts = slices.filter((s) => s.value > 0);
  const total = parts.reduce((t, s) => t + s.value, 0);
  if (total <= 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        🌱 ยังไม่มีมูลค่าในพอร์ต
      </p>
    );
  }

  // Keep tiny slices visible, and leave a gap only when there is more than one slice.
  const gap = parts.length > 1 ? GAP : 0;
  const shares = parts.map((s) => (s.value / total) * 100);
  const arcs = parts.map((s, i) => ({
    ...s,
    share: shares[i],
    len: Math.max(shares[i] - gap, 0.6),
    offset: shares.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="relative size-32 shrink-0 2xl:size-36">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--subtle)"
            strokeWidth="14"
          />
          {arcs.map((a) => (
            <circle
              key={a.id}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="14"
              pathLength={100}
              strokeDasharray={`${a.len} ${100 - a.len}`}
              strokeDashoffset={-a.offset}
              className="transition-[stroke-width] hover:[stroke-width:16]"
            >
              <title>{`${a.name}: ${fmt(a.value)} ฿ (${fmtPct(a.share)})`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted">มูลค่ารวม</span>
          <span className="text-lg font-bold tabular-nums">
            {compact(total)}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {arcs.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-subtle"
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: a.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">
              {a.emoji} {a.name}
            </span>
            <span className="text-right tabular-nums">
              <span className="block font-semibold">{fmt(a.value, 0)}</span>
              <span className="block text-xs text-muted">
                {fmtPct(a.share)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
