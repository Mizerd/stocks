import { afterEach, describe, expect, it, vi } from 'vitest';
import { findInstrument, STOCKS } from '../shared/catalog';
import { EXCHANGES, isCurrentQuote, lastSessionTime, sessionState, tradingDayOfYear, zonedTime } from '../shared/exchanges';
import type { Candle, Listing } from '../shared/types';
import { memo, shared, takeBackgroundWork } from '../worker/http';
import worker from '../worker/index';
import { currentSession, history, previousSession, previousTradingDay, toWeekly, yearStats } from '../worker/market';
import { resolveSymbol, tickerSymbol, toSector } from '../worker/universe';

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

describe('edge cache of parsed data', () => {
  // The Workers Cache API, kept in memory.
  function installCache() {
    const stored = new Map<string, Response>();
    const calls: string[] = [];
    const edge = {
      async match(url: string) {
        calls.push(`match ${url}`);
        return stored.get(url)?.clone();
      },
      async put(url: string, response: Response) {
        calls.push(`put ${url}`);
        stored.set(url, response);
      },
    };
    vi.stubGlobal('caches', { default: edge });
    return { stored, calls };
  }

  afterEach(() => {
    takeBackgroundWork();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('stores what a cold isolate parsed, with its expiry', async () => {
    const { stored, calls } = installCache();
    expect(await shared('test:miss', 60, async () => ({ rows: [1, 2] }))).toEqual({ rows: [1, 2] });
    await Promise.all(takeBackgroundWork());
    const url = 'https://cache.internal/test%3Amiss';
    expect(calls).toEqual([`match ${url}`, `put ${url}`]);
    const copy = stored.get(url)!;
    expect(await copy.clone().json()).toEqual({ rows: [1, 2] });
    expect(copy.headers.get('Cache-Control')).toBe('max-age=60');
    expect(Date.parse(copy.headers.get('Expires')!)).toBeGreaterThan(Date.now() + 58_000);
  });

  it('reads an edge copy instead of loading, and keeps it only as long as that copy is good for', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const { stored, calls } = installCache();
    const expires = new Date('2026-11-13T12:00:10Z').toUTCString();
    stored.set('https://cache.internal/test%3Ahit', new Response('{"a":1}', { headers: { Expires: expires } }));
    let loads = 0;
    const load = async () => ({ a: ++loads + 1 });
    expect(await shared('test:hit', 60, load)).toEqual({ a: 1 });
    expect(await shared('test:hit', 60, load)).toEqual({ a: 1 });
    expect(calls).toHaveLength(1);
    vi.setSystemTime(new Date('2026-11-13T12:00:11Z'));
    stored.clear();
    expect(await shared('test:hit', 60, load)).toEqual({ a: 2 });
    expect(loads).toBe(1);
  });

  it('works without a cache, as in tests and local scripts', async () => {
    expect(await shared('test:none', 60, async () => [3])).toEqual([3]);
    expect(takeBackgroundWork()).toEqual([]);
  });
});

describe('stale-while-revalidate', () => {
  const start = Date.parse('2026-11-13T12:00:00Z');
  const at = (seconds: number) => vi.setSystemTime(start + seconds * 1000);

  afterEach(() => {
    takeBackgroundWork();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function counter() {
    const loads = { n: 0, fail: false };
    const load = async () => {
      loads.n++;
      if (loads.fail) throw new Error('source down');
      return loads.n;
    };
    return { loads, load };
  }

  it('serves a fresh value without loading again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const { loads, load } = counter();
    expect(await memo('swr:fresh', 60, load, 120)).toBe(1);
    at(59);
    expect(await memo('swr:fresh', 60, load, 120)).toBe(1);
    expect(loads.n).toBe(1);
    expect(takeBackgroundWork()).toEqual([]);
  });

  it('serves a stale value at once and refreshes it once in the background', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const { loads, load } = counter();
    await memo('swr:stale', 60, load, 120);
    at(90);
    expect(await Promise.all([memo('swr:stale', 60, load, 120), memo('swr:stale', 60, load, 120)])).toEqual([1, 1]);
    const work = takeBackgroundWork();
    expect(work).toHaveLength(1);
    await Promise.all(work);
    expect(loads.n).toBe(2);
    expect(await memo('swr:stale', 60, load, 120)).toBe(2);
  });

  it('waits for a new value once the grace period is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const { loads, load } = counter();
    await memo('swr:expired', 60, load, 120);
    at(181);
    expect(await memo('swr:expired', 60, load, 120)).toBe(2);
    expect(loads.n).toBe(2);
    expect(takeBackgroundWork()).toEqual([]);
  });

  it('keeps the stale value when a refresh fails, and tries again on the next request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const { loads, load } = counter();
    await memo('swr:failing', 60, load, 120);
    loads.fail = true;
    at(90);
    expect(await memo('swr:failing', 60, load, 120)).toBe(1);
    await Promise.all(takeBackgroundWork());
    expect(await memo('swr:failing', 60, load, 120)).toBe(1);
    expect(takeBackgroundWork()).toHaveLength(1);
    expect(loads.n).toBe(3);
  });

  it('serves a stale edge copy to a fresh isolate and replaces it in the background', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(100);
    const stored = new Map<string, Response>();
    vi.stubGlobal('caches', { default: {
      async match(url: string) { return stored.get(url)?.clone(); },
      async put(url: string, response: Response) { stored.set(url, response); },
    } });
    const url = 'https://cache.internal/swr%3Aedge';
    stored.set(url, new Response('{"v":"old"}', { headers: { Expires: new Date(start + 60_000).toUTCString() } }));
    const load = vi.fn(async () => ({ v: 'new' }));
    expect(await shared('swr:edge', 60, load, 120)).toEqual({ v: 'old' });
    await Promise.all(takeBackgroundWork());
    await Promise.all(takeBackgroundWork());
    expect(load).toHaveBeenCalledTimes(1);
    expect(await stored.get(url)!.clone().json()).toEqual({ v: 'new' });
    expect(stored.get(url)!.headers.get('Cache-Control')).toBe('max-age=180');
    expect(await shared('swr:edge', 60, load, 120)).toEqual({ v: 'new' });
  });

  it('serves a stale API answer from the edge cache at once and replaces it in the background, once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(4000);
    const stored = new Map<string, Response>();
    vi.stubGlobal('caches', { default: {
      async match(request: Request) { return stored.get(request.url)?.clone(); },
      async put(request: Request, response: Response) { stored.set(request.url, response); },
    } });
    const xml = "<Cube time='2026-11-13'><Cube currency='USD' rate='1.1'/></Cube>";
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml)));
    const url = 'https://example.com/api/fx';
    stored.set(url, new Response('{"stale":true}', { headers: { 'Cache-Control': 'public, max-age=176400', Expires: new Date(start + 3600_000).toUTCString() } }));

    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
    for (let i = 0; i < 2; i++) {
      const res = await worker.fetch(new Request(url), {}, ctx);
      expect(await res.json()).toEqual({ stale: true });
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=0');
    }
    await Promise.all(waits);
    expect(fetch).toHaveBeenCalledTimes(1);
    const kept = stored.get(url)!;
    expect(await kept.clone().json()).toEqual({ date: '2026-11-13', perEur: { EUR: 1, USD: 1.1 } });
    expect(kept.headers.get('Cache-Control')).toBe('public, max-age=176400');
    expect(Date.parse(kept.headers.get('Expires')!)).toBe(start + 7600_000);

    const fresh = await worker.fetch(new Request(url), {}, ctx);
    expect(fresh.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(waits).toHaveLength(2);
  });
});

describe('symbol lookup', () => {
  it('finds a US share from the screener lists without fetching live quotes', async () => {
    const realFetch = globalThis.fetch;
    const called: string[] = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      called.push(String(url));
      const row = (symbol: string, name: string) =>
        ({ symbol, name, lastsale: '$100.00', netchange: '1', pctchange: '1%', volume: '1', marketCap: '1', sector: 'Consumer Staples', industry: '' });
      const rows = String(url).includes('exchange=nyse') ? [row('WMT', 'Walmart Inc. Common Stock')] : [row('COST', 'Costco Wholesale Corporation Common Stock')];
      return new Response(JSON.stringify({ data: { rows } }));
    };
    try {
      expect(await resolveSymbol('wmt')).toMatchObject({ symbol: 'WMT', name: 'Walmart Inc.', exchange: 'XNYS', sector: 'S', provider: 'nasdaq' });
      expect(called.some((url) => url.includes('watchlist'))).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('which session the 1D chart shows', () => {
  const nasdaq = EXCHANGES.XNAS;
  const MINUTE = 60_000;
  // Bars from a New York wall-clock time, one a minute.
  const minutes = (day: string, hhmm: string, closes: number[]) =>
    closes.map((c, i) => bar(zonedTime(day, hhmm, 'America/New_York').getTime() + i * MINUTE, c));
  // Friday 13 November 2026, 07:17 in New York: pre-market.
  const preMarket = new Date('2026-11-13T12:17:00Z');
  const thursday = { candles: minutes('2026-11-12', '09:30', [354, 355]), prevClose: 353 };

  it('finds the trading day before today across weekends and holidays', () => {
    expect(previousTradingDay(nasdaq, preMarket)).toBe('2026-11-12');
    expect(previousTradingDay(nasdaq, new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-13');
    expect(previousTradingDay(nasdaq, new Date('2026-11-16T13:00:00Z'))).toBe('2026-11-13');
    // Thanksgiving, and the Friday after it.
    expect(previousTradingDay(nasdaq, new Date('2026-11-26T15:00:00Z'))).toBe('2026-11-25');
    expect(previousTradingDay(nasdaq, new Date('2026-11-27T15:00:00Z'))).toBe('2026-11-25');
    // Late in the evening in New York is already the next day in UTC.
    expect(previousTradingDay(nasdaq, new Date('2026-11-14T03:00:00Z'))).toBe('2026-11-12');
    expect(previousTradingDay(EXCHANGES.XLIT, new Date('2026-11-13T07:00:00Z'))).toBe('2026-11-12');
  });

  it('shows today once it has traded, ahead of pre-market trades', () => {
    const fresh = { candles: minutes('2026-11-13', '09:30', [356, 357]), prevClose: 355, premarket: minutes('2026-11-13', '04:00', [356]) };
    expect(currentSession(fresh, nasdaq, new Date('2026-11-13T14:32:00Z'))).toEqual({
      candles: fresh.candles, prevClose: 355, session: { kind: 'today', day: '2026-11-13' },
    });
  });

  it('shows US pre-market trades before the open, against the previous close', () => {
    const premarket = minutes('2026-11-13', '04:00', [356.1, 355.9]);
    expect(currentSession({ candles: [], prevClose: 355.36, premarket }, nasdaq, preMarket)).toEqual({
      candles: premarket, prevClose: 355.36, session: { kind: 'premarket', day: '2026-11-13' },
    });
    expect(currentSession({ candles: [], prevClose: 355.36, premarket: minutes('2026-11-12', '04:00', [1]) }, nasdaq, preMarket)).toBeNull();
  });

  it('labels a previous session the source still serves before the open', () => {
    expect(currentSession(thursday, nasdaq, preMarket)?.session).toEqual({ kind: 'previous', day: '2026-11-12' });
    // Bars older than the previous trading day are not passed off as it.
    expect(currentSession(thursday, nasdaq, new Date('2026-11-17T12:00:00Z'))).toBeNull();
  });

  it('falls back to a kept session only if it is the trading day before today', () => {
    expect(currentSession({ candles: [], prevClose: 355, premarket: [] }, nasdaq, preMarket)).toBeNull();
    expect(previousSession(thursday, nasdaq, preMarket)).toEqual({
      candles: thursday.candles, prevClose: 353, session: { kind: 'previous', day: '2026-11-12' },
    });
    expect(previousSession(thursday, nasdaq, new Date('2026-11-14T12:00:00Z'))).toBeNull();
    expect(previousSession(null, nasdaq, preMarket)).toBeNull();
    expect(previousSession({ candles: [], prevClose: 1 }, nasdaq, preMarket)).toBeNull();
  });
});

describe('1D history outside the session', () => {
  const stored = new Map<string, Response>();
  const realFetch = globalThis.fetch;

  afterEach(() => {
    stored.clear();
    takeBackgroundWork();
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function installCache() {
    vi.stubGlobal('caches', { default: {
      async match(url: string) { return stored.get(url)?.clone(); },
      async put(url: string, response: Response) { stored.set(url, response); },
    } });
  }

  it('serves a Nordic share\'s last session from the edge cache before the next open', async () => {
    installCache();
    const novo = STOCKS.find((s) => s.symbol === 'NOVO-B.CO')!;
    const thursday = Date.parse('2026-11-12T08:00:00Z') / 1000;
    let points: unknown[] | null = [{ x: thursday, y: 274.8 }, { x: thursday + 60, y: 275.1 }];
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { chartData: { previousClose: 'DKK 270.00' }, CP: points } }));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    expect((await history(novo, '1D'))?.session).toEqual({ kind: 'today', day: '2026-11-12' });
    await Promise.all(takeBackgroundWork());
    expect([...stored.keys()]).toEqual(['https://cache.internal/session%3ANOVO-B.CO']);

    // Friday before the open: the source has nothing for today yet.
    points = null;
    vi.setSystemTime(new Date('2026-11-13T07:30:00Z'));
    const day = await history(novo, '1D');
    expect(day).toMatchObject({ interval: 'intraday', prevClose: 270, session: { kind: 'previous', day: '2026-11-12' } });
    expect(day!.candles.map((c) => c.c)).toEqual([274.8, 275.1]);

    // Without a kept copy the chart stays unavailable.
    stored.clear();
    vi.setSystemTime(new Date('2026-11-13T07:32:00Z'));
    expect(await history(novo, '1D')).toBeNull();
  });

  it('fetches the previous day of a Baltic share from the exchange instead', async () => {
    installCache();
    const ignitis = STOCKS.find((s) => s.symbol === 'IGN1L.VS')!;
    const called: string[] = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      called.push(String(url));
      const trades = String(url).includes('start=2026-11-12') ? [[Date.parse('2026-11-12T08:00:00Z'), 22.1, 5]] : [];
      return new Response(JSON.stringify({ data: { chart_type: 'intraday', prev_last_price: 22.05, data: trades } }));
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T07:00:00Z'));
    expect(await history(ignitis, '1D')).toMatchObject({ prevClose: 22.05, session: { kind: 'previous', day: '2026-11-12' } });
    expect(called.map((url) => url.match(/start=([\d-]+)/)![1])).toEqual(['2026-11-13', '2026-11-12']);
    expect(takeBackgroundWork()).toEqual([]);
  });
});
