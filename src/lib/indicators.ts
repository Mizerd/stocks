// All functions take closes oldest-first and return an array of the same length,
// with null where there is not enough history yet.

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export interface Band {
  upper: number;
  lower: number;
}

// SMA plus and minus `width` standard deviations over the same window.
export function bollinger(values: number[], period = 20, width = 2): (Band | null)[] {
  const mean = sma(values, period);
  return values.map((_, i) => {
    const m = mean[i];
    if (m === null) return null;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - m) ** 2;
    const sd = Math.sqrt(variance / period);
    return { upper: m + width * sd, lower: m - width * sd };
  });
}

// RSI over simple sums of gains and losses, as in the design spec.
export function rsi(values: number[], period = 14): (number | null)[] {
  return values.map((_, i) => {
    if (i < period) return null;
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = values[j] - values[j - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) return gains === 0 ? 50 : 100;
    return 100 - 100 / (1 + gains / losses);
  });
}

// Axis ticks on a step of 1, 2, 5 or 10 x 10^n, about `target` of them.
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

// Percentage return of each value against the first one.
export function returnsPct(values: number[]): number[] {
  return values.map((v) => (v / values[0] - 1) * 100);
}
