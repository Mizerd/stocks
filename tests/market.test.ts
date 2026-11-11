import { describe, expect, it } from 'vitest';
import { findInstrument, STOCKS } from '../shared/catalog';
import { EXCHANGES, sessionState, tradingDayOfYear, zonedTime } from '../shared/exchanges';
import type { Candle } from '../shared/types';
import worker from '../worker/index';
import { toWeekly, yearStats } from '../worker/market';

const DAY = 24 * 3600 * 1000;
const bar = (t: number, c: number): Candle => ({ t, o: c, h: c + 1, l: c - 1, c, v: 100 });

describe('catalogue', () => {
  it('resolves symbols, bare tickers and old names', () => {
    expect(findInstrument('asml.as')?.symbol).toBe('ASML.AS');
    expect(findInstrument('IGN1L')?.symbol).toBe('IGN1L.VS');
    expect(findInstrument('SAB1L.VS')?.symbol).toBe('ROE1L.VS');
    expect(findInstrument('NOPE')).toBeUndefined();
  });

  it('has unique symbols and covers all three regions', () => {
    const symbols = STOCKS.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(new Set(STOCKS.map((s) => s.region))).toEqual(new Set(['US', 'EU', 'BAL']));
  });
});

describe('exchange sessions', () => {
  const nasdaq = EXCHANGES.XNAS;

  it('converts wall-clock time across daylight saving', () => {
    expect(zonedTime('2026-11-10', '09:30', 'America/New_York').toISOString()).toBe('2026-11-10T14:30:00.000Z');
    expect(zonedTime('2026-07-01', '09:30', 'America/New_York').toISOString()).toBe('2026-07-01T13:30:00.000Z');
  });

  it('is open during the session and reports progress', () => {
    const state = sessionState(nasdaq, new Date('2026-11-10T17:45:00Z'));
    expect(state.isOpen).toBe(true);
    expect(state.progress).toBeCloseTo(0.5);
    expect(state.closesAt.toISOString()).toBe('2026-11-10T21:00:00.000Z');
  });

  it('points to Monday when asked on a Saturday', () => {
    const state = sessionState(nasdaq, new Date('2026-11-14T15:00:00Z'));
    expect(state.isOpen).toBe(false);
    expect(state.opensAt.toISOString()).toBe('2026-11-16T14:30:00.000Z');
  });

  it('skips holidays', () => {
    const thanksgiving = sessionState(nasdaq, new Date('2026-11-26T16:00:00Z'));
    expect(thanksgiving.isOpen).toBe(false);
    expect(thanksgiving.opensAt.toISOString()).toBe('2026-11-27T14:30:00.000Z');
  });

  it('counts trading days', () => {
    // 2 January 2026 is the first session of the year: New Year's Day is a holiday.
    expect(tradingDayOfYear(nasdaq, new Date('2026-01-02T18:00:00Z'))).toBe(1);
    expect(tradingDayOfYear(nasdaq, new Date('2026-01-05T18:00:00Z'))).toBe(2);
  });
});

describe('history maths', () => {
  it('rolls daily bars into Monday-based weeks', () => {
    const monday = Date.UTC(2026, 10, 2);
    const weeks = toWeekly([bar(monday, 10), bar(monday + DAY, 12), bar(monday + 4 * DAY, 11), bar(monday + 7 * DAY, 14)]);
    expect(weeks).toEqual([
      { t: monday, o: 10, h: 13, l: 9, c: 11, v: 300 },
      { t: monday + 7 * DAY, o: 14, h: 15, l: 13, c: 14, v: 100 },
    ]);
  });

  it('computes one-year return and range from real bars only', () => {
    const now = Date.now();
    const stats = yearStats([bar(now - 400 * DAY, 50), bar(now - 200 * DAY, 80), bar(now - DAY, 100)], 110);
    expect(stats.return1Y).toBeCloseTo(120);
    expect(stats.high52).toBe(110);
    expect(stats.low52).toBe(79);
  });

  it('leaves the one-year return empty when history is too short', () => {
    expect(yearStats([bar(Date.now() - DAY, 100)], 100).return1Y).toBeNull();
  });
});

describe('API routing', () => {
  const get = (path: string, method = 'GET') => worker.fetch(new Request(`https://example.com${path}`, { method }));

  it('rejects unknown routes, symbols and ranges without calling a provider', async () => {
    expect((await get('/api/nope')).status).toBe(404);
    expect((await get('/api/history?symbol=NOPE&range=1Y')).status).toBe(404);
    expect((await get('/api/about?symbol=NOPE')).status).toBe(404);
    expect((await get('/api/about?title=Main_Page')).status).toBe(404);
    expect((await get('/api/history?symbol=AAPL&range=10Y')).status).toBe(400);
    expect((await get('/api/stocks?symbols=AAPL,NOPE')).status).toBe(404);
    expect((await get('/api/stocks')).status).toBe(400);
    expect((await get(`/api/stocks?symbols=${STOCKS.slice(0, 9).map((s) => s.symbol).join(',')}`)).status).toBe(400);
  });

  it('is read-only', async () => {
    expect((await get('/api/fx', 'POST')).status).toBe(405);
  });
});
