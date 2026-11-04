/** Rounds up to a readable 1–10 × 10ⁿ step (finer than 1/2/5 so short charts don't waste space). */
export function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * exp >= value)!;
  return step * exp;
}

/** Axis / direct-label numbers: 77,502 → 7.8 หมื่น style compact Thai notation. */
export const compact = (n: number) =>
  new Intl.NumberFormat("th-TH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
