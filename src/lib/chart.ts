// Helpers for the hand-built SVG charts. Charts use a fixed viewBox stretched with
// preserveAspectRatio="none", so x and y here are viewBox units, not pixels.
import { zonedParts } from '../../shared/exchanges';
import type { Candle, History, StockSummary } from '../../shared/types';
import { direction } from './format';

export interface Scale {
  min: number;
  max: number;
}

export type XY = [number, number];

export function scaleOf(values: number[], padding = 0.06): Scale {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * padding;
  return { min: min - pad, max: max + pad };
}

export const yOf = (value: number, scale: Scale, height: number) =>
  height - ((value - scale.min) / (scale.max - scale.min)) * height;

const xy = ([x, y]: XY) => `${x.toFixed(1)} ${y.toFixed(1)}`;

// Slope of the curve at each point, limited so that the curve never rises above or dips below
// its neighbours (Fritsch–Carlson, as d3's curveMonotoneX).
function tangents(points: XY[]): number[] {
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0] || 1));
  const inner = slopes.slice(1).map((after, i) => {
    const before = slopes[i];
    if (before * after <= 0) return 0;
    const width = (j: number) => points[j + 1][0] - points[j][0];
    const blend = (before * width(i + 1) + after * width(i)) / (width(i) + width(i + 1));
    return Math.sign(before) * Math.min(Math.abs(before), Math.abs(after), Math.abs(blend) / 2) * 2;
  });
  const last = slopes.length - 1;
  const first = (3 * slopes[0] - (inner[0] ?? slopes[0])) / 2;
  const end = (3 * slopes[last] - (inner[last - 1] ?? slopes[last])) / 2;
  return [first, ...inner, end];
}

// A smooth curve through every point. `start` is 'L' to continue an open path instead of
// starting a new one.
// Below this many points a curve swings between them and invents shape, so the line stays straight.
export const SMOOTH_MIN = 24;

// Thinly traded stocks have long gaps between trades; there the price really stays flat,
// and a curve would turn each step into a bump.
export function evenlySpaced(points: XY[]): boolean {
  const gaps = points.slice(1).map((p, i) => p[0] - points[i][0]);
  const smallest = Math.min(...gaps);
  return gaps.filter((gap) => gap <= smallest * 1.5).length >= gaps.length * 0.8;
}

export function smoothPath(points: XY[], start: 'M' | 'L' = 'M'): string {
  if (points.length === 0) return '';
  if (points.length < SMOOTH_MIN || !evenlySpaced(points)) return points.map((p, i) => `${i ? 'L' : start}${xy(p)}`).join('');
  const slope = tangents(points);
  let path = `${start}${xy(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const third = (x1 - x0) / 3;
    path += `C${xy([x0 + third, y0 + third * slope[i - 1]])} ${xy([x1 - third, y1 - third * slope[i]])} ${xy(points[i])}`;
  }
  return path;
}

// Points of a series, split into runs wherever a value is missing.
export function runs(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): XY[][] {
  const result: XY[][] = [];
  let run: XY[] = [];
  values.forEach((v, i) => {
    if (v !== null) run.push([x(i), y(v)]);
    else if (run.length) {
      result.push(run);
      run = [];
    }
  });
  if (run.length) result.push(run);
  return result;
}

export function curvePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  return runs(values, x, y).map((run) => smoothPath(run)).join('');
}

// Evenly spaced curve across the full width.
export function seriesPath(values: (number | null)[], scale: Scale, width: number, height: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return curvePath(values, (i) => i * step, (v) => yOf(v, scale, height));
}

export function sparkPath(values: number[], width = 100, height = 28): string {
  if (values.length < 2) return '';
  return seriesPath(values, scaleOf(values, 0.08), width, height);
}

// Smallest gap between two bars, which is the bar length of an intraday history.
export function barInterval(times: number[], fallback = 5 * 60_000): number {
  let gap = Infinity;
  for (let i = 1; i < times.length; i++) {
    const step = times[i] - times[i - 1];
    if (step > 0 && step < gap) gap = step;
  }
  return Number.isFinite(gap) ? gap : fallback;
}

// Merges bars into longer ones that start on whole multiples of `ms`.
export function aggregateCandles(bars: Candle[], ms: number): Candle[] {
  const result: Candle[] = [];
  for (const bar of bars) {
    const t = Math.floor(bar.t / ms) * ms;
    const open = result[result.length - 1];
    if (open?.t !== t) {
      result.push({ ...bar, t });
      continue;
    }
    open.h = Math.max(open.h, bar.h);
    open.l = Math.min(open.l, bar.l);
    open.c = bar.c;
    open.v = open.v === null && bar.v === null ? null : (open.v ?? 0) + (bar.v ?? 0);
  }
  return result;
}

// Round times (every 15 min up to every 2 h) between start and end, at most `count` of them.
export function timeTicks(start: number, end: number, count: number): number[] {
  const steps = [15, 30, 60, 120, 240].map((minutes) => minutes * 60_000);
  const step = steps.find((s) => Math.floor(end / s) - Math.ceil(start / s) + 1 <= count) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t);
  return ticks;
}

// Picks about `count` evenly spread indices, for x-axis labels.
export function spread(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}

// Index of the position closest to x. Null when x lies more than `slack` outside the positions,
// which is how the untraded part of an intraday chart stays inert. Positions run left to right.
export function nearestIndex(positions: number[], x: number, slack = Infinity): number | null {
  const last = positions.length - 1;
  if (last < 0 || x < positions[0] - slack || x > positions[last] + slack) return null;
  let low = 0;
  let high = last;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (positions[mid] < x) low = mid + 1;
    else high = mid;
  }
  return low > 0 && x - positions[low - 1] <= positions[low] - x ? low - 1 : low;
}

export interface Point {
  t: number;
  c: number;
}

// Change between two points, always measured from the earlier one to the later one.
export function pointDiff<P extends Point>(a: P, b: P) {
  const [from, to] = a.t <= b.t ? [a, b] : [b, a];
  const change = to.c - from.c;
  return { from, to, change, pct: from.c ? (change / from.c) * 100 : null };
}

// The colour of a line that went up or down over its period.
export function toneOf(change: number | null): string {
  const tone = direction(change);
  return tone === 'up' ? 'var(--up)' : tone === 'dn' ? 'var(--down)' : 'var(--ink)';
}

// Daily histories end at the last completed session; add the current session from the live quote.
export function withLatestQuote(history: History, quote: StockSummary | undefined, timezone: string): History {
  const bars = history.candles;
  if (!quote || history.interval !== 'day' || bars.length === 0) return history;
  const day = zonedParts(new Date(quote.time), timezone).day;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (t <= bars[bars.length - 1].t) return history;
  const open = quote.open ?? quote.prevClose;
  const bar: Candle = {
    t,
    o: open,
    h: Math.max(quote.high ?? quote.price, quote.price, open),
    l: Math.min(quote.low ?? quote.price, quote.price, open),
    c: quote.price,
    v: quote.volume,
  };
  return { ...history, candles: [...bars, bar] };
}
