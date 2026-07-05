// Compact number formatting for display (1240 → "1.2k", 248723 → "249k").
export const formatCount = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(Math.round(n));
