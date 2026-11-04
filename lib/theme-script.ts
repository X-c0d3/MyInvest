export const THEME_KEY = "myinvest-theme";

/**
 * Runs before hydration (next/script beforeInteractive) so the page never flashes the wrong theme.
 * Resolves the stored preference (or the OS setting) to data-theme="light" | "dark".
 */
export const themeScript = `(() => {
  const key = ${JSON.stringify(THEME_KEY)};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    let pref = "system";
    try { pref = localStorage.getItem(key) || "system"; } catch {}
    const dark = pref === "dark" || (pref === "system" && mq.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  apply();
  mq.addEventListener("change", apply);
  window.__applyTheme = apply;
})();`;
