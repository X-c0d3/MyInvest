"use client";

import { useState, type ReactNode } from "react";

/**
 * A card body that switches between server-rendered views of the same data (e.g. bar / line).
 * It draws the card header itself so the tab buttons sit at the top-right, next to `action`,
 * instead of adding a row above the chart. `children` is shared content shown above the chart.
 */
export function ChartTabs({
  title,
  action,
  tabs,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  tabs: { key: string; label: string; content: ReactNode }[];
  children?: ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <div
            role="tablist"
            aria-label="รูปแบบกราฟ"
            className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active === t.key}
                onClick={() => setActive(t.key)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${
                  active === t.key
                    ? "bg-surface font-semibold text-accent shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {children}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
