"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A symbol dropdown that only offers symbols already in the portfolio chosen in the same form
 * (its `portfolioId` select), so records can't be filed under a name the system doesn't know.
 * With `allowNew` (the trade form, where new symbols come from), a "➕ ใหม่" button switches to
 * a text box for a symbol bought for the first time.
 */
export function SymbolSelect({
  byPortfolio,
  defaultPortfolioId,
  defaultValue,
  allowNew = false,
}: {
  /** Known symbols per portfolio id. */
  byPortfolio: Record<number, string[]>;
  defaultPortfolioId?: number;
  defaultValue?: string;
  allowNew?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId);
  const [custom, setCustom] = useState(false);

  // Follow the form's portfolio select.
  useEffect(() => {
    const form = ref.current?.closest("form");
    const select = form?.elements.namedItem("portfolioId");
    if (!(select instanceof HTMLSelectElement)) return;
    const sync = () => {
      setPortfolioId(Number(select.value));
      setCustom(false);
    };
    select.addEventListener("change", sync);
    return () => select.removeEventListener("change", sync);
  }, []);

  const options = (portfolioId && byPortfolio[portfolioId]) || [];

  if (custom) {
    return (
      <div ref={ref}>
        <div className="flex gap-2">
          <input
            name="symbol"
            autoFocus
            autoComplete="off"
            placeholder="เช่น IRPC, VOO, AAPL, BTC"
            className="input flex-1 uppercase"
            required
          />
          {options.length ? (
            <button
              type="button"
              className="btn-ghost shrink-0 px-3"
              onClick={() => setCustom(false)}
            >
              เลือกจากรายการ
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">
          ➕ Symbol ใหม่ ใช้ได้เฉพาะรายการซื้อ (BUY)
        </p>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <div className="flex gap-2">
        <select
          name="symbol"
          key={portfolioId}
          defaultValue={
            defaultValue && options.includes(defaultValue) ? defaultValue : ""
          }
          className="input min-w-0 flex-1"
          required
        >
          <option value="" disabled>
            {options.length ? "เลือก Symbol" : "ยังไม่มี Symbol ในพอร์ตนี้"}
          </option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {allowNew ? (
          <button
            type="button"
            className="btn-ghost shrink-0 px-3"
            onClick={() => setCustom(true)}
            title="Symbol ที่ยังไม่เคยซื้อ"
          >
            ➕ ใหม่
          </button>
        ) : null}
      </div>
      {options.length === 0 && !allowNew ? (
        <p className="mt-1 text-xs text-muted">
          เพิ่มหุ้นที่หน้าหลักทรัพย์ที่ถือหรือซื้อ-ขายก่อน แล้วจึงบันทึกปันผล
        </p>
      ) : null}
    </div>
  );
}
