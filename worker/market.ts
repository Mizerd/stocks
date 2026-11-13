import { toListing } from '../shared/catalog';
import type { Candle, History, Instrument, ProviderId, Range, StockDetail, StockSummary } from '../shared/types';
import { memo } from './http';
import { baltic } from './providers/baltic';
import { euronext } from './providers/euronext';
import { nasdaq } from './providers/nasdaq';
import { nordic } from './providers/nordic';
import { NO_EXTRAS, type Provider } from './providers/provider';

export const PROVIDERS: Record<ProviderId, Provider> = { nasdaq, nordic, euronext, baltic };

const DAY = 24 * 3600 * 1000;
const WARMUP_BARS = 50;
// A little over a year, so the 1Y window still has warm-up bars in front of it.
const SUMMARY_YEARS = 1.35;

const RANGE_DAYS: Record<Exclude<Range, '1D' | 'YTD'>, number> = {
  '5D': 7, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 5 * 366,
};

// Parsed candles are kept per isolate, so a warm isolate never downloads or parses a history twice.
function daily(inst: Instrument, years: number): Promise<Candle[]> {
  return memo(`daily:${inst.symbol}:${years}`, 900, () => PROVIDERS[inst.provider].daily(inst, years));
}

export function summary(inst: Instrument): Promise<StockSummary> {
  return memo(`summary:${inst.symbol}`, 60, async () => {
    const candles = await daily(inst, SUMMARY_YEARS);
    const quote = await PROVIDERS[inst.provider].quote(inst, candles);
    return { ...toListing(inst), ...quote, ...yearStats(candles, quote.price) };
  });
}

export function yearStats(daily: Candle[], price: number) {
  const yearAgo = Date.now() - 365 * DAY;
  const year = daily.filter((c) => c.t >= yearAgo);
  // The close on, or just before, the day one year ago.
  const base = daily.filter((c) => c.t < yearAgo).pop();
  return {
    high52: year.length ? Math.max(price, ...year.map((c) => c.h)) : null,
    low52: year.length ? Math.min(price, ...year.map((c) => c.l)) : null,
    return1Y: base ? (price / base.c - 1) * 100 : null,
    spark: daily.slice(-28).map((c) => c.c),
  };
}

export async function history(inst: Instrument, range: Range): Promise<History | null> {
  if (range === '1D') {
    const intraday = await memo(`intraday:${inst.symbol}`, 60, () => PROVIDERS[inst.provider].intraday(inst));
    if (!intraday || intraday.candles.length === 0) return null;
    return { symbol: inst.symbol, range, interval: 'intraday', warmup: 0, ...intraday };
  }

  const weekly = range === '5Y';
  const candles = await daily(inst, weekly ? 6.1 : SUMMARY_YEARS);
  const from = range === 'YTD' ? Date.UTC(new Date().getUTCFullYear(), 0, 1) : Date.now() - RANGE_DAYS[range] * DAY;
  const bars = weekly ? toWeekly(candles) : candles;
  const firstVisible = bars.findIndex((c) => c.t >= from);
  if (firstVisible < 0) return null;
  const start = Math.max(0, firstVisible - WARMUP_BARS);
  return {
    symbol: inst.symbol,
    range,
    interval: weekly ? 'week' : 'day',
    warmup: firstVisible - start,
    candles: bars.slice(start),
    prevClose: firstVisible > 0 ? bars[firstVisible - 1].c : null,
  };
}

// Weeks start on Monday; 1970-01-05 was one.
export function toWeekly(daily: Candle[]): Candle[] {
  const weeks: Candle[] = [];
  for (const c of daily) {
    const monday = Math.floor((c.t - 4 * DAY) / (7 * DAY)) * 7 * DAY + 4 * DAY;
    const week = weeks[weeks.length - 1];
    if (week && week.t === monday) {
      week.h = Math.max(week.h, c.h);
      week.l = Math.min(week.l, c.l);
      week.c = c.c;
      if (c.v != null) week.v = (week.v ?? 0) + c.v;
    } else {
      weeks.push({ ...c, t: monday });
    }
  }
  return weeks;
}

export async function detail(inst: Instrument): Promise<StockDetail> {
  const provider = PROVIDERS[inst.provider];
  const [sum, extras] = await Promise.all([
    summary(inst),
    provider.details ? provider.details(inst).catch(() => NO_EXTRAS) : NO_EXTRAS,
  ]);
  return { summary: sum, ...extras };
}
