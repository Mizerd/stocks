import { toListing } from '../shared/catalog';
import { EXCHANGES, latestSession, zonedParts, zonedTime, type Exchange } from '../shared/exchanges';
import type { Candle, History, Instrument, IntradaySession, ProviderId, Range, StockDetail, StockSummary } from '../shared/types';
import { edgeKeep, edgeRead, memo, shared } from './http';
import { baltic } from './providers/baltic';
import { euronext } from './providers/euronext';
import { nasdaq } from './providers/nasdaq';
import { nordic } from './providers/nordic';
import { NO_EXTRAS, type Intraday, type Provider } from './providers/provider';

export const PROVIDERS: Record<ProviderId, Provider> = { nasdaq, nordic, euronext, baltic };

const DAY = 24 * 3600 * 1000;
const WARMUP_BARS = 50;
// A little over a year, so the 1Y window still has warm-up bars in front of it.
const SUMMARY_YEARS = 1.35;

const RANGE_DAYS: Record<Exclude<Range, '1D' | 'YTD'>, number> = {
  '5D': 7, '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 5 * 366,
};

// Parsed candles are kept per isolate. The summary window feeds most routes, so with `edge` it is also
// kept in the data centre's edge cache, at the cost of two more subrequests.
function daily(inst: Instrument, years: number, edge = true): Promise<Candle[]> {
  const keep = edge && years === SUMMARY_YEARS ? shared : memo;
  return keep(`daily:${inst.symbol}:${years}`, 900, () => PROVIDERS[inst.provider].daily(inst, years));
}

export function summary(inst: Instrument, edge = true): Promise<StockSummary> {
  return memo(`summary:${inst.symbol}`, 60, async () => {
    const candles = await daily(inst, SUMMARY_YEARS, edge);
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
    const day = await memo(`intraday:${inst.symbol}`, 60, () => oneDay(inst, new Date()));
    return day && { symbol: inst.symbol, range, interval: 'intraday', warmup: 0, ...day };
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

export interface SessionBars {
  candles: Candle[];
  prevClose: number | null;
  session: IntradaySession;
}

// Long enough to carry Friday's session over a weekend.
const KEEP_SESSION_SECONDS = 4 * 24 * 3600;

async function oneDay(inst: Instrument, now: Date): Promise<SessionBars | null> {
  const provider = PROVIDERS[inst.provider];
  const ex = EXCHANGES[inst.exchange];
  const fresh = await provider.intraday(inst);
  if (!fresh) return null;
  const current = currentSession(fresh, ex, now);
  // Sources that serve today only: keep today's bars for the morning after, in this data centre.
  const key = `session:${inst.symbol}`;
  if (current?.session.kind === 'today' && !provider.pastIntraday) edgeKeep(key, current, KEEP_SESSION_SECONDS);
  if (current) return current;
  const earlier = provider.pastIntraday
    ? await provider.pastIntraday(inst, previousTradingDay(ex, now))
    : await edgeRead<SessionBars>(key);
  return previousSession(earlier, ex, now);
}

const dayOf = (bars: Candle[], ex: Exchange) => zonedParts(new Date(bars[0].t), ex.timezone).day;

// The last trading day before today's date at the exchange.
export function previousTradingDay(ex: Exchange, now: Date): string {
  const midnight = zonedTime(zonedParts(now, ex.timezone).day, '00:00', ex.timezone);
  return zonedParts(latestSession(ex, new Date(midnight.getTime() - 1)).opens, ex.timezone).day;
}

// What the source has for the 1D chart: today's session once it has traded, US pre-market trades
// before that, or the previous session where the source still serves it (Nasdaq indices before the open).
export function currentSession(fresh: Intraday, ex: Exchange, now: Date): SessionBars | null {
  const { candles, prevClose, premarket = [] } = fresh;
  const today = zonedParts(now, ex.timezone).day;
  if (candles.length > 0) {
    const day = dayOf(candles, ex);
    if (day === today) return { candles, prevClose, session: { kind: 'today', day } };
    return previousSession(fresh, ex, now);
  }
  if (premarket.length > 0 && dayOf(premarket, ex) === today) {
    return { candles: premarket, prevClose, session: { kind: 'premarket', day: today } };
  }
  return null;
}

// Bars of an earlier session, shown only if they are the trading day before today.
export function previousSession(earlier: Intraday | null, ex: Exchange, now: Date): SessionBars | null {
  if (!earlier || earlier.candles.length === 0) return null;
  const day = dayOf(earlier.candles, ex);
  if (day !== previousTradingDay(ex, now)) return null;
  return { candles: earlier.candles, prevClose: earlier.prevClose, session: { kind: 'previous', day } };
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
