"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "สว่าง", Icon: Sun },
  { value: "dark", label: "มืด", Icon: Moon },
  { value: "system", label: "ตามระบบ", Icon: Monitor },
];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref | null>(null);

  useEffect(() => {
    let stored: ThemePref = "system";
    try {
      stored = (localStorage.getItem(KEY) as ThemePref) || "system";
    } catch {}
    // Sync from localStorage, which only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(stored);
  }, []);

  const choose = (value: ThemePref) => {
    setPref(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {}
    (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
  };

  return (
    <div
      role="radiogroup"
      aria-label="ธีม"
      className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          title={label}
          onClick={() => choose(value)}
          className={`inline-flex size-8 items-center justify-center rounded-lg transition ${
            pref === value
              ? "bg-surface text-accent shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
