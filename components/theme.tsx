"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";

/** Fired after ThemeSwitch stores a new choice, so a ThemeToggle on the same page can follow. */
const THEME_EVENT = "myinvest-theme-change";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "สว่าง", Icon: Sun },
  { value: "dark", label: "มืด", Icon: Moon },
  { value: "system", label: "ตามระบบ", Icon: Monitor },
];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref | null>(null);

  useEffect(() => {
    const read = () => {
      let stored: ThemePref = "system";
      try {
        stored = (localStorage.getItem(KEY) as ThemePref) || "system";
      } catch {}
      setPref(stored);
    };
    // Sync from localStorage, which only exists in the browser.
    read();
    // The one-button switch elsewhere on the page announces its changes.
    window.addEventListener(THEME_EVENT, read);
    return () => window.removeEventListener(THEME_EVENT, read);
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

/**
 * One-button light/dark switch for the sidebar, phone top bar and login pages.
 * The first visit follows the device (system); a click stores the opposite of what is showing.
 * The full three-way choice (incl. ตามระบบ) stays on the account page.
 */
export function ThemeSwitch() {
  const toggle = () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  // The icon comes from the dark: variant, so it is right before hydration and needs no state.
  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn size-9"
      title="สลับธีมสว่าง / มืด"
    >
      <Moon className="size-[18px] dark:hidden" />
      <Sun className="hidden size-[18px] dark:block" />
      <span className="sr-only">สลับธีมสว่าง / มืด</span>
    </button>
  );
}
