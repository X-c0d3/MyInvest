"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, fmtDate, fmtPrice, fmtQty } from "@/lib/format";

export type HistoryTrade = {
  id: number;
  date: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  /** Already contained in the opening position (shown as "รวมแล้ว"). */
  covered: boolean;
};

export type HistoryDividend = {
  id: number;
  paidDate: string;
  shares: number;
  dps: number;
  gross: number;
  tax: number;
  net: number;
};

/** How long the pointer must rest on a symbol before the modal opens. */
const HOVER_DELAY_MS = 350;

const total = (t: HistoryTrade) =>
  t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee);

/**
 * A symbol name that opens its trade history in a modal, on hover (after a short delay), click
 * or keyboard: summary tiles, a price line with the average buy price, and every trade.
 */
export function SymbolHistory({
  symbol,
  portfolioName,
  currency,
  trades,
  dividends,
}: {
  symbol: string;
  portfolioName: string;
  currency: string;
  /** Oldest first. */
  trades: HistoryTrade[];
  /** Newest first. */
  dividends: HistoryDividend[];
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  return (
    <>
      <button
        type="button"
        className="cursor-pointer font-semibold underline decoration-line decoration-dotted underline-offset-4 hover:text-accent"
        title="ดูประวัติการซื้อขาย"
        onMouseEnter={() => {
          cancel();
          timer.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
        }}
        onMouseLeave={cancel}
        onClick={() => {
          cancel();
          setOpen(true);
        }}
      >
        {symbol}
      </button>
      {open
        ? createPortal(
            <HistoryDialog
              symbol={symbol}
              portfolioName={portfolioName}
              currency={currency}
              trades={trades}
              dividends={dividends}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function HistoryDialog({
  symbol,
  portfolioName,
  currency,
  trades,
  dividends,
  onClose,
}: {
  symbol: string;
  portfolioName: string;
  currency: string;
  trades: HistoryTrade[];
  dividends: HistoryDividend[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [year, setYear] = useState("all");
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const years = [
    ...new Set([
      ...trades.map((t) => t.date.slice(0, 4)),
      ...dividends.map((d) => d.paidDate.slice(0, 4)),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const shown =
    year === "all" ? trades : trades.filter((t) => t.date.startsWith(year));
  const shownDividends =
    year === "all"
      ? dividends
      : dividends.filter((d) => d.paidDate.startsWith(year));
  const dividendNet = shownDividends.reduce((s, d) => s + d.net, 0);
  const buys = shown.filter((t) => t.side === "buy");
  const sells = shown.filter((t) => t.side === "sell");
  const boughtQty = buys.reduce((s, t) => s + t.quantity, 0);
  const avgBuy = boughtQty
    ? buys.reduce((s, t) => s + t.quantity * t.price, 0) / boughtQty
    : null;
  const cheapest = buys.length
    ? buys.reduce((a, b) => (b.price < a.price ? b : a))
    : null;
  const dearest = buys.length
    ? buys.reduce((a, b) => (b.price > a.price ? b : a))
    : null;

  const tiles = [
    {
      label: "ราคาซื้อเฉลี่ย",
      value: avgBuy === null ? "-" : fmtPrice(avgBuy),
      hint: `${fmtQty(boughtQty)} หน่วย`,
      tone: "",
    },
    {
      label: "ซื้อถูกที่สุด",
      value: cheapest ? fmtPrice(cheapest.price) : "-",
      hint: cheapest ? fmtDate(cheapest.date) : "",
      tone: "text-pos",
    },
    {
      label: "ซื้อแพงที่สุด",
      value: dearest ? fmtPrice(dearest.price) : "-",
      hint: dearest ? fmtDate(dearest.date) : "",
      tone: "text-neg",
    },
    {
      label: "จำนวนรายการ",
      value: `${shown.length} ครั้ง`,
      hint: `ซื้อ ${buys.length} · ขาย ${sells.length}`,
      tone: "",
    },
  ];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close(); // click on the backdrop
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-line bg-surface p-5 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xl"
            aria-hidden
          >
            📈
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              ประวัติการซื้อขาย {symbol}
            </h2>
            <p className="truncate text-xs text-muted">
              {portfolioName} · ราคาเป็น {currency} ต่อหน่วย
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {years.length > 1 ? (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="input w-auto py-1.5"
              aria-label="เลือกปี"
            >
              <option value="all">ทุกปี</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  ปี {y}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="icon-btn"
            title="ปิด"
          >
            <X className="size-5" />
            <span className="sr-only">ปิด</span>
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line p-3">
            <p className="text-xs text-muted">{t.label}</p>
            <p className={`text-lg font-bold tabular-nums ${t.tone}`}>
              {t.value}
            </p>
            <p className="text-xs text-muted tabular-nums">{t.hint}</p>
          </div>
        ))}
      </div>

      {shown.length > 0 ? (
        <PriceLine trades={shown} avgBuy={avgBuy} currency={currency} />
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          🛒 ไม่มีรายการซื้อขายในช่วงนี้
        </p>
      )}

      <div
        className={`mt-5 max-h-56 overflow-y-auto ${shown.length ? "" : "hidden"}`}
      >
        <table className="table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>รายการ</th>
              <th className="num">จำนวน</th>
              <th className="num">ราคา</th>
              <th className="num">ค่าธรรมเนียม</th>
              <th className="num">มูลค่ารวม</th>
            </tr>
          </thead>
          <tbody>
            {[...shown].reverse().map((t) => (
              <tr key={t.id} className={t.covered ? "text-muted" : undefined}>
                <td className="tabular-nums">{fmtDate(t.date)}</td>
                <td>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`badge ${t.side === "buy" ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}
                    >
                      {t.side === "buy" ? "BUY" : "SELL"}
                    </span>
                    {t.covered ? (
                      <span className="badge bg-subtle text-[10px] text-muted">
                        รวมแล้ว
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="num">{fmtQty(t.quantity)}</td>
                <td className="num">{fmtPrice(t.price)}</td>
                <td className="num">{fmtPrice(t.fee)}</td>
                <td className="num">
                  {fmt(total(t))}
                  <span className="ml-1 text-xs text-muted">{currency}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">🎁 ปันผลที่ได้รับ</h3>
          {shownDividends.length > 0 ? (
            <p className="text-sm tabular-nums">
              <span className="text-xs text-muted">
                รวมสุทธิ {shownDividends.length} ครั้ง{" "}
              </span>
              <span className="font-semibold text-pos">{fmt(dividendNet)}</span>
              <span className="ml-1 text-xs text-muted">{currency}</span>
            </p>
          ) : null}
        </div>
        {shownDividends.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">
            ยังไม่มีปันผลของหุ้นนี้ในช่วงนี้
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>วันจ่าย</th>
                  <th className="num">จำนวนหุ้น</th>
                  <th className="num">ปันผล/หุ้น</th>
                  <th className="num">รวม</th>
                  <th className="num">ภาษี</th>
                  <th className="num">สุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {shownDividends.map((d) => (
                  <tr key={d.id}>
                    <td className="tabular-nums">{fmtDate(d.paidDate)}</td>
                    <td className="num">{fmtQty(d.shares)}</td>
                    <td className="num">{fmt(d.dps, 4)}</td>
                    <td className="num">{fmt(d.gross)}</td>
                    <td className="num text-muted">{fmt(d.tax)}</td>
                    <td className="num font-semibold text-pos">
                      {fmt(d.net)}
                      <span className="ml-1 text-xs font-normal text-muted">
                        {currency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-3 text-xs text-muted">
        เส้น = ราคาที่ซื้อขายจริง · เส้นประ = ราคาซื้อเฉลี่ย ·
        ชี้ที่จุดเพื่อดูวันที่และราคา
      </p>
    </dialog>
  );
}

/** Trade prices over time on one price axis, with the average buy price as a dashed line. */
function PriceLine({
  trades,
  avgBuy,
  currency,
}: {
  trades: HistoryTrade[];
  avgBuy: number | null;
  currency: string;
}) {
  const height = 180;
  const prices = trades.map((t) => t.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.25 || max * 0.1 || 1;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const y = (p: number) => (1 - (p - lo) / (hi - lo)) * 100;

  const times = trades.map((t) => Date.parse(t.date));
  const first = times[0];
  const span = times[times.length - 1] - first;
  const x = (i: number) => {
    if (trades.length === 1) return 50;
    const ratio =
      span > 0 ? (times[i] - first) / span : i / (trades.length - 1);
    return 4 + ratio * 92;
  };
  const points = trades.map((t, i) => ({ t, x: x(i), y: y(t.price) }));
  const ticks = [hi, (hi + lo) / 2, lo];

  const buys = points.filter((p) => p.t.side === "buy");
  const best =
    buys.length > 1
      ? buys.reduce((a, b) => (b.t.price < a.t.price ? b : a))
      : null;
  const worst =
    buys.length > 1
      ? buys.reduce((a, b) => (b.t.price > a.t.price ? b : a))
      : null;

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
            style={{ top: `${y(t)}%` }}
          >
            {fmtPrice(t)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t, i) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? "border-line" : "border-dashed border-line/60"}`}
              style={{ top: `${y(t)}%` }}
            />
          ))}

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            {points.length > 1 ? (
              <>
                <polygon
                  points={`${points[0].x},100 ${points.map((p) => `${p.x},${p.y}`).join(" ")} ${points[points.length - 1].x},100`}
                  fill="color-mix(in oklab, var(--accent) 12%, transparent)"
                />
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {avgBuy !== null ? (
            <div
              className="absolute inset-x-0 border-t border-dashed border-muted"
              style={{ top: `${y(avgBuy)}%` }}
            >
              <span className="absolute -top-4 right-0 text-[11px] text-muted tabular-nums">
                เฉลี่ย {fmtPrice(avgBuy)}
              </span>
            </div>
          ) : null}

          {points.map((p) => (
            <div
              key={p.t.id}
              tabIndex={0}
              className="group absolute size-6 -translate-x-1/2 -translate-y-1/2 outline-none hover:z-10 focus-visible:z-10"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span
                className={`absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-transform group-hover:scale-125 ${p.t.side === "buy" ? "bg-pos" : "bg-neg"}`}
              />
              {p === best || p === worst ? (
                <span
                  className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap tabular-nums ${p === best ? "top-full text-pos" : "bottom-full text-neg"}`}
                >
                  {p === best ? "ถูกสุด" : "แพงสุด"} {fmtPrice(p.t.price)}
                </span>
              ) : null}
              <div
                role="tooltip"
                className={`pointer-events-none absolute top-full z-20 mt-1 hidden w-44 rounded-xl border border-line bg-surface p-2.5 text-xs shadow-lg group-hover:block group-focus-visible:block ${p.x > 60 ? "right-0" : "left-0"}`}
              >
                <p className="mb-1 font-semibold tabular-nums">
                  {fmtDate(p.t.date)} ·{" "}
                  <span
                    className={p.t.side === "buy" ? "text-pos" : "text-neg"}
                  >
                    {p.t.side === "buy" ? "BUY" : "SELL"}
                  </span>
                </p>
                <p className="tabular-nums">
                  {fmtQty(p.t.quantity)} @ {fmtPrice(p.t.price)} {currency}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex justify-between text-xs text-muted tabular-nums">
          <span>{fmtDate(trades[0].date)}</span>
          {trades[0].date !== trades[trades.length - 1].date ? (
            <span>{fmtDate(trades[trades.length - 1].date)}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
