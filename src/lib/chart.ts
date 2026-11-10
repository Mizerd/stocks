// Helpers for the hand-built SVG charts. Charts use a fixed viewBox stretched with
// preserveAspectRatio="none", so x and y here are viewBox units, not pixels.

export interface Scale {
  min: number;
  max: number;
}

export function scaleOf(values: number[], padding = 0.06): Scale {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * padding;
  return { min: min - pad, max: max + pad };
}

export const yOf = (value: number, scale: Scale, height: number) =>
  height - ((value - scale.min) / (scale.max - scale.min)) * height;

export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

// Evenly spaced line across the full width, skipping nulls.
export function seriesPath(values: (number | null)[], scale: Scale, width: number, height: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points: [number, number][] = [];
  values.forEach((v, i) => {
    if (v !== null) points.push([i * step, yOf(v, scale, height)]);
  });
  return linePath(points);
}

export function sparkPath(values: number[], width = 100, height = 28): string {
  if (values.length < 2) return '';
  return seriesPath(values, scaleOf(values, 0.08), width, height);
}

// Picks about `count` evenly spread indices, for x-axis labels.
export function spread(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}

// Index of the position closest to x. Null when x lies more than `slack` outside the positions,
// which is how the untraded part of an intraday chart stays inert.
export function nearestIndex(positions: number[], x: number, slack = Infinity): number | null {
  const last = positions.length - 1;
  if (last < 0 || x < positions[0] - slack || x > positions[last] + slack) return null;
  let best = 0;
  for (let i = 1; i <= last; i++) {
    if (Math.abs(positions[i] - x) < Math.abs(positions[best] - x)) best = i;
  }
  return best;
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
