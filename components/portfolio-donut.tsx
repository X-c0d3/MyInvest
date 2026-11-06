"use client";

import { useState } from "react";
import { compact } from "@/lib/chart";
import { BASE_CURRENCY, fmt, fmtPct } from "@/lib/format";

export type DonutSlice = {
  id: number;
  emoji: string;
  name: string;
  /** Value in THB. */
  value: number;
  /** Fixed color from seriesColor() (or --muted for "อื่นๆ"), so it matches the other charts. */
  color: string;
  /** The same value in the item's own currency, when that is not the base currency. */
  native?: { value: number; currency: string };
  /** Short muted text after the name in the legend, e.g. a share count. */
  sub?: string;
  /** Extra tooltip lines, e.g. trade counts or the names folded into "อื่นๆ". */
  info?: [label: string, value: string][];
};

const R = 42;
/** Surface gap between slices, in pathLength units (the ring is 100 long). */
const GAP = 1.2;

/**
 * Share of total value per item: a ring with the total in the middle and a legend that carries
 * every name, amount and percent, so identity never depends on color alone. Hovering (or
 * focusing) a slice or a legend row highlights it, shows it in the middle of the ring, and opens
 * a tooltip with its details.
 */
export function PortfolioDonut({
  slices,
  small = false,
}: {
  slices: DonutSlice[];
  /** A smaller ring for narrow cards, leaving the legend room for names. */
  small?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
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
  const hot = arcs.find((a) => a.id === active) ?? null;
  const hover = (id: number) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(id),
    onBlur: () => setActive(null),
  });

  return (
    <div
      className={`flex flex-col items-center gap-5 sm:flex-row sm:items-center ${small ? "sm:gap-4" : "sm:gap-6"}`}
    >
      <div
        className={`relative shrink-0 ${small ? "size-28 2xl:size-36" : "size-36"}`}
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--subtle)"
            strokeWidth="12"
          />
          {arcs.map((a) => (
            <circle
              key={a.id}
              {...hover(a.id)}
              tabIndex={0}
              aria-label={`${a.name} ${fmt(a.value)} บาท ${fmtPct(a.share)}`}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={a.id === active ? 15 : 12}
              pathLength={100}
              strokeDasharray={`${a.len} ${100 - a.len}`}
              strokeDashoffset={-a.offset}
              className="cursor-pointer outline-none transition-[stroke-width,opacity] duration-150"
              style={{ opacity: hot && a.id !== active ? 0.3 : 1 }}
            />
          ))}
        </svg>

        {/* Middle: the total, or the hovered item. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          {hot ? (
            <>
              <span className="max-w-full truncate text-[11px] font-medium">
                {hot.emoji} {hot.name}
              </span>
              <span
                className={`font-bold tracking-tight tabular-nums ${small ? "text-lg" : "text-xl"}`}
              >
                {fmtPct(hot.share)}
              </span>
              <span className="text-[11px] text-muted tabular-nums">
                {compact(hot.value)} ฿
              </span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted">มูลค่ารวม</span>
              <span
                className={`font-bold tracking-tight tabular-nums ${small ? "text-lg" : "text-xl"}`}
              >
                {compact(total)}
              </span>
              <span className="text-[11px] text-muted">
                {arcs.length} รายการ
              </span>
            </>
          )}
        </div>

        {/* Tooltip beside the ring's top-right. */}
        {hot ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-56 -translate-x-1/2 sm:top-0 sm:left-full sm:mt-0 sm:ml-2 sm:translate-x-0 max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg"
          >
            <p className="mb-1.5 flex items-center gap-2 font-semibold">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: hot.color }}
              />
              {hot.emoji} {hot.name}
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
              <dt className="text-muted">มูลค่า ({BASE_CURRENCY})</dt>
              <dd className="text-right font-semibold">{fmt(hot.value)}</dd>
              {hot.native ? (
                <>
                  <dt className="text-muted">มูลค่า ({hot.native.currency})</dt>
                  <dd className="text-right">{fmt(hot.native.value)}</dd>
                </>
              ) : null}
              <dt className="text-muted">สัดส่วน</dt>
              <dd className="text-right">{fmtPct(hot.share)}</dd>
              {hot.info?.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>

      {/* Legend: name and amount on one line, a share bar with its % under it. */}
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {arcs.map((a) => (
          <li
            key={a.id}
            {...hover(a.id)}
            tabIndex={0}
            className={`cursor-default rounded-lg px-1.5 py-1 text-sm outline-none transition-[background-color,opacity] ${
              a.id === active ? "bg-subtle" : hot ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span
                className="size-2.5 shrink-0 translate-y-[1px] rounded-sm"
                style={{ background: a.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {a.emoji} {a.name}
                {a.sub ? (
                  <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
                    {a.sub}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold tabular-nums">
                {fmt(a.value, 0)}
                <span className="ml-1 text-xs font-normal text-muted">
                  {BASE_CURRENCY}
                </span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 pl-[18px]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(a.share, 0.5)}%`,
                    background: a.color,
                  }}
                />
              </div>
              <span className="text-right text-xs whitespace-nowrap text-muted tabular-nums">
                {a.native ? (
                  <span className="mr-1.5">
                    {fmt(a.native.value)} {a.native.currency} ·
                  </span>
                ) : null}
                {fmtPct(a.share)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
