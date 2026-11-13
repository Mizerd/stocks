import { describe, expect, it } from 'vitest';
import { findInstrument, STOCKS } from '../shared/catalog';
import { EXCHANGES, isCurrentQuote, lastSessionTime, sessionState, tradingDayOfYear, zonedTime } from '../shared/exchanges';
import type { Candle, Listing } from '../shared/types';
import worker from '../worker/index';
import { toWeekly, yearStats } from '../worker/market';
import { tickerSymbol, toSector } from '../worker/universe';

const DAY = 24 * 3600 * 1000;
const bar = (t: number, c: number): Candle => ({ t, o: c, h: c + 1, l: c - 1, c, v: 100 });

describe('catalogue', () => {
  it('resolves symbols, bare tickers and old names', () => {
    expect(findInstrument('asml.as')?.symbol).toBe('ASML.AS');
    expect(findInstrument('IGN1L')?.symbol).toBe('IGN1L.VS');
    expect(findInstrument('SAB1L.VS')?.symbol).toBe('ROE1L.VS');
    expect(findInstrument('NOPE')).toBeUndefined();
  });

  it('looks a symbol up in the wider universe after the catalogue', () => {
    const universe: Listing[] = [
      { symbol: 'VOLV-B.ST', name: 'Volvo B', kind: 'stock', exchange: 'XSTO', currency: 'SEK', region: 'EU', sector: 'I', provider: 'nordic' },
    ];
    expect(findInstrument('volv-b.st', universe)?.name).toBe('Volvo B');
    expect(findInstrument('VOLV-B.ST')).toBeUndefined();
    expect(findInstrument('ASML', universe)?.symbol).toBe('ASML.AS');
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

describe('universe', () => {
  it('maps the sources\' sector names onto the site\'s sectors', () => {
    expect(toSector('Finance')).toBe('F');
    expect(toSector('Financials')).toBe('F');
    expect(toSector('Utilities', 'Natural Gas Distribution', 'KMI')).toBe('E');
    expect(toSector('Utilities', 'Natural Gas Distribution', 'SRE')).toBe('U');
    expect(toSector('Real Estate')).toBe('R');
    expect(toSector('Utilities ')).toBe('U');
    expect(toSector('Utilities', 'Environmental Services')).toBe('I');
    expect(toSector('Utilities', 'Oil/Gas Transmission')).toBe('E');
    expect(toSector('Miscellaneous')).toBeUndefined();
    expect(toSector('')).toBeUndefined();
  });

  it('turns exchange tickers into site symbols', () => {
    expect(tickerSymbol('NOVO B', '.CO')).toBe('NOVO-B.CO');
    expect(tickerSymbol('BRK/B', '')).toBe('BRK-B');
    expect(tickerSymbol('LEN.B', '')).toBe('LEN-B');
    expect(tickerSymbol('IGN1L', '.VS')).toBe('IGN1L.VS');
  });

  it('stamps bulk prices with now during the session and with the close after it', () => {
    const nyse = EXCHANGES.XNYS;
    expect(lastSessionTime(nyse, new Date('2026-11-10T17:00:00Z')).toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(lastSessionTime(nyse, new Date('2026-11-10T23:00:00Z')).toISOString()).toBe('2026-11-10T21:00:00.000Z');
    // Before Wednesday's open, and over a weekend, the previous session counts.
    expect(lastSessionTime(nyse, new Date('2026-11-11T12:00:00Z')).toISOString()).toBe('2026-11-10T21:00:00.000Z');
    expect(lastSessionTime(nyse, new Date('2026-11-15T12:00:00Z')).toISOString()).toBe('2026-11-13T21:00:00.000Z');
  });

  it('tells a quote of the latest session from an earlier close', () => {
    const nyse = EXCHANGES.XNYS;
    const during = new Date('2026-11-11T15:00:00Z');
    expect(isCurrentQuote(nyse, '2026-11-11T14:59:00Z', during)).toBe(true);
    expect(isCurrentQuote(nyse, '2026-11-10T21:00:00Z', during)).toBe(false);
    // Before the bell, yesterday's close is still the latest session.
    expect(isCurrentQuote(nyse, '2026-11-10T21:00:00Z', new Date('2026-11-11T13:00:00Z'))).toBe(true);
  });

  it('knows Stockholm and Riga trading hours and holidays', () => {
    expect(sessionState(EXCHANGES.XSTO, new Date('2026-11-11T16:00:00Z')).isOpen).toBe(true);
    expect(sessionState(EXCHANGES.XSTO, new Date('2026-11-11T16:45:00Z')).isOpen).toBe(false);
    expect(sessionState(EXCHANGES.XRIS, new Date('2026-11-11T12:00:00Z')).isOpen).toBe(true);
    expect(sessionState(EXCHANGES.XRIS, new Date('2026-11-18T12:00:00Z')).isOpen).toBe(false);
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

  it('rejects unknown routes, symbols and ranges, checking symbols against the bulk lists only', async () => {
    const realFetch = globalThis.fetch;
    const called: string[] = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      called.push(String(url));
      return new Response(JSON.stringify({ data: { rows: [], instrumentListing: { rows: [] } } }));
    };
    try {
      expect((await get('/api/history?symbol=NOPE&range=1Y')).status).toBe(404);
      expect((await get('/api/detail?symbol=NOPE.ST')).status).toBe(404);
      expect((await get('/api/quotes?market=mars')).status).toBe(400);
      expect((await get('/api/universe?region=US')).status).toBe(400);
      expect(called.every((url) => url.includes('/screener/'))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('rejects malformed requests without calling a provider', async () => {
    expect((await get('/api/nope')).status).toBe(404);
    expect((await get('/api/history?symbol=AAPL&range=10Y')).status).toBe(400);
    expect((await get('/api/about?title=Main_Page')).status).toBe(404);
    expect((await get('/api/detail?symbol=../../etc')).status).toBe(404);
    expect((await get('/api/stocks')).status).toBe(400);
    expect((await get(`/api/stocks?symbols=${STOCKS.slice(0, 9).map((s) => s.symbol).join(',')}`)).status).toBe(400);
  });

  it('is read-only', async () => {
    expect((await get('/api/fx', 'POST')).status).toBe(405);
  });
});
