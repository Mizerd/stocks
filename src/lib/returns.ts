import type { Candle, Region } from '../../shared/types';

export const RETURN_PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;
export type ReturnPeriod = (typeof RETURN_PERIODS)[number];

const DAY = 24 * 3600 * 1000;
// The same windows the API uses for its chart ranges.
const PERIOD_DAYS: Record<Exclude<ReturnPeriod, 'YTD'>, number> = {
  '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 5 * 366,
};

// The index each region's stocks are measured against.
export const BENCHMARK: Record<Region, string> = { US: 'NDX', EU: 'N100', BAL: 'OMXVGI' };

export function periodStart(period: ReturnPeriod, now: number): number {
  if (period === 'YTD') return Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  return now - PERIOD_DAYS[period] * DAY;
}

// Percentage change from the last close before `from` to `last`.
// Null when the bars do not reach back that far, so a short history never passes for a full period.
export function returnSince(candles: Candle[], from: number, last: number): number | null {
  const base = candles.filter((c) => c.t < from).pop();
  return base && base.c > 0 ? (last / base.c - 1) * 100 : null;
}

// Where `value` sits between `low` and `high`, 0..100. Null for an empty range.
export function rangePosition(low: number, high: number, value: number): number | null {
  if (!(high > low)) return null;
  return Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
}
