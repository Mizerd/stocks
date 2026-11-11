import { describe, expect, it } from 'vitest';
import type { Candle, FxRates, History, StockSummary } from '../shared/types';
import { nearestIndex, pointDiff } from '../src/lib/chart';
import { createFormat } from '../src/lib/format';
import { bollinger, niceTicks, rsi, sma } from '../src/lib/indicators';
import { anyMarketOpen, barometer, sectorMoves } from '../src/lib/market';
import { cleanEntry, isDate, parseDecimal, parseList, serializeList, upsert } from '../src/lib/myList';
import { allocation, listRows, portfolioReturns, sortRows, valuePortfolio } from '../src/lib/portfolio';
import { quarterRows } from '../src/lib/quarters';
import { periodStart, rangePosition, returnSince } from '../src/lib/returns';
import { filterStocks, NO_FILTERS, parseState, sortStocks, toSearchParams } from '../src/lib/screener';
import { alignCloses } from '../src/lib/series';
import { shortSummary } from '../src/lib/text';
import { dragAxis, onBubble } from '../src/lib/useChartSelection';

const fx: FxRates = { date: '2026-11-09', perEur: { EUR: 1, USD: 1.25 } };

function stock(overrides: Partial<StockSummary>): StockSummary {
  return {
    symbol: 'X', name: 'X', kind: 'stock', exchange: 'XNAS', currency: 'USD', region: 'US', sector: 'T',
    provider: 'nasdaq', providerId: 'X', price: 100, change: 0, changePct: 0, prevClose: 100, open: null, high: null,
    low: null, volume: null, time: '2026-11-10T15:00:00Z', freshness: 'realtime', marketCap: null, pe: null, eps: null,
    dividend: null, dividendYield: null, avgVolume: null, high52: null, low52: null, return1Y: null, spark: [],
    ...overrides,
  };
}

describe('number formatting', () => {
  const en = createFormat('en');
  const lt = createFormat('lt');

  it('uses each language’s separators', () => {
    expect(en.num(1234.56)).toBe('1,234.56');
    expect(lt.num(1234.56)).toBe('1 234,56');
  });

  it('signs changes with a true minus and a plus', () => {
    expect(en.pct(1.12)).toBe('+1.12%');
    expect(en.pct(-0.42)).toBe('−0.42%');
    expect(lt.pct(1.12)).toBe('+1,12 %');
    expect(en.pct(0)).toBe('0.00%');
    expect(en.pct(-0.001)).toBe('0.00%');
  });

  it('shortens large numbers', () => {
    expect(en.big(3.61e12)).toBe('3.61T');
    expect(en.big(752e9)).toBe('752B');
    expect(lt.big(48.2e6)).toBe('48,2 mln.');
  });

  it('shows a dash for missing values', () => {
    expect(en.num(null)).toBe('—');
    expect(en.pct(undefined)).toBe('—');
    expect(en.big(null)).toBe('—');
  });

  it('gives cheap shares a third decimal', () => {
    expect(en.price(0.832)).toBe('0.832');
    expect(en.price(21.45)).toBe('21.45');
  });

  it('formats dates per language', () => {
    expect(lt.date('2026-11-10T12:00:00Z', 'UTC')).toBe('2026-11-10');
    expect(en.date('2026-11-10T12:00:00Z', 'UTC')).toBe('Nov 10, 2026');
  });
});

describe('indicators', () => {
  it('computes a simple moving average', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('computes Bollinger bands around the average', () => {
    const band = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8)[7]!;
    expect(band.upper).toBeCloseTo(9);
    expect(band.lower).toBeCloseTo(1);
  });

  it('computes RSI from gains and losses', () => {
    expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100);
    expect(rsi([1, 2, 1, 2, 1], 4)[4]).toBeCloseTo(50);
    expect(rsi([1, 2], 14)[1]).toBeNull();
  });

  it('picks round axis ticks', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(21.4, 21.6, 2)).toEqual([21.4, 21.5, 21.6]);
  });
});

describe('overview maths', () => {
  it('reads 50 on a flat market and moves with breadth', () => {
    expect(barometer([stock({ changePct: 0 })])).toBe(50);
    expect(barometer([stock({ changePct: 2 }), stock({ changePct: 2 })])).toBe(100);
    expect(barometer([stock({ changePct: -3 })])).toBe(0);
    expect(barometer([])).toBeNull();
  });

  it('averages moves per sector and folds staples into consumer', () => {
    const moves = sectorMoves([
      stock({ sector: 'D', changePct: 1 }), stock({ sector: 'S', changePct: 3 }), stock({ sector: 'T', changePct: -1 }),
    ]);
    expect(moves).toEqual([{ sector: 'D', count: 2, changePct: 2 }, { sector: 'T', count: 1, changePct: -1 }]);
  });
});

describe('portfolio maths', () => {
  const quotes = [stock({ symbol: 'A', price: 125, changePct: 25, dividend: 2.5 }), stock({ symbol: 'B', currency: 'EUR', price: 10 })];
  const holdings = [{ symbol: 'A', quantity: 10, buyPrice: 100 }, { symbol: 'B', quantity: 50, buyPrice: 8 }, { symbol: 'GONE', quantity: 1, buyPrice: 1 }];
  const valuation = valuePortfolio(holdings, quotes, fx, 500);

  it('values holdings in euros and skips ones without a quote', () => {
    expect(valuation.positions.map((p) => p.stock.symbol)).toEqual(['A', 'B']);
    expect(valuation.holdingsEur).toBe(1500);
    expect(valuation.totalEur).toBe(2000);
    expect(valuation.costEur).toBe(1200);
    expect(valuation.gainPct).toBeCloseTo(25);
    expect(valuation.positions[0].weight).toBe(0.5);
  });

  it('derives the day change from the percentage move', () => {
    expect(valuation.dayEur).toBeCloseTo(200);
    expect(valuation.positions[0].dividendEur).toBe(20);
    expect(valuation.positions[1].dividendEur).toBeNull();
  });

  it('tracks hypothetical returns over aligned closes', () => {
    expect(portfolioReturns(valuation.positions, [[100, 125], [10, 10]], fx)).toEqual([0, 15.384615384615374]);
  });
});

describe('chart selection maths', () => {
  it('snaps to the nearest point', () => {
    const positions = [10, 20, 40];
    expect(nearestIndex(positions, 0)).toBe(0);
    expect(nearestIndex(positions, 14)).toBe(0);
    expect(nearestIndex(positions, 16)).toBe(1);
    expect(nearestIndex(positions, 31)).toBe(2);
    expect(nearestIndex(positions, 900)).toBe(2);
  });

  it('ignores positions beyond the slack around the points', () => {
    expect(nearestIndex([10, 20, 40], 45, 5)).toBe(2);
    expect(nearestIndex([10, 20, 40], 46, 5)).toBeNull();
    expect(nearestIndex([10, 20, 40], 4, 5)).toBeNull();
    expect(nearestIndex([], 10)).toBeNull();
  });

  it('measures the change from the earlier point to the later one', () => {
    const early = { t: 1, c: 200 };
    const late = { t: 2, c: 150 };
    expect(pointDiff(early, late)).toEqual({ from: early, to: late, change: -50, pct: -25 });
    expect(pointDiff(late, early)).toEqual({ from: early, to: late, change: -50, pct: -25 });
    expect(pointDiff({ t: 1, c: 80 }, { t: 3, c: 100 })).toMatchObject({ change: 20, pct: 25 });
  });

  it('has no percentage when the earlier price is zero', () => {
    expect(pointDiff({ t: 1, c: 0 }, { t: 2, c: 5 }).pct).toBeNull();
  });
});

describe('series alignment', () => {
  const history = (points: [number, number][], warmup = 0): History => ({
    symbol: 'X', range: '1M', interval: 'day', warmup, prevClose: null,
    candles: points.map(([t, c]) => ({ t, o: c, h: c, l: c, c, v: null })),
  });

  it('starts at the latest first date and carries closes over gaps', () => {
    const aligned = alignCloses([history([[1, 10], [2, 11], [3, 12]]), history([[2, 20], [4, 22]]), undefined]);
    expect(aligned.times).toEqual([2, 3, 4]);
    expect(aligned.closes).toEqual([[11, 12, 12], [20, 20, 22], []]);
  });

  it('ignores warm-up bars', () => {
    expect(alignCloses([history([[1, 10], [2, 11]], 1)]).times).toEqual([2]);
  });
});

describe('screener', () => {
  const list = [
    stock({ symbol: 'BIG', sector: 'T', marketCap: 2.5e12, pe: 30, dividendYield: 0.5, changePct: 1 }),
    stock({ symbol: 'MID', sector: 'F', marketCap: 5e11, pe: 12, dividendYield: 2.5, changePct: -1 }),
    stock({ symbol: 'BALT', sector: 'U', region: 'BAL', currency: 'EUR', changePct: 0.2 }),
  ];
  const symbols = (stocks: StockSummary[]) => stocks.map((s) => s.symbol);

  it('filters by sector, region and direction', () => {
    expect(symbols(filterStocks(list, { ...NO_FILTERS, sectors: ['T', 'F'] }, fx))).toEqual(['BIG', 'MID']);
    expect(symbols(filterStocks(list, { ...NO_FILTERS, regions: ['BAL'] }, fx))).toEqual(['BALT']);
    expect(symbols(filterStocks(list, { ...NO_FILTERS, direction: 'down' }, fx))).toEqual(['MID']);
    expect(symbols(filterStocks(list, { ...NO_FILTERS, query: 'bal' }, fx))).toEqual(['BALT']);
  });

  it('leaves out unknown figures once a limit is set', () => {
    expect(filterStocks(list, NO_FILTERS, fx)).toHaveLength(3);
    expect(symbols(filterStocks(list, { ...NO_FILTERS, peMax: 20 }, fx))).toEqual(['MID']);
    expect(symbols(filterStocks(list, { ...NO_FILTERS, dyMin: 2 }, fx))).toEqual(['MID']);
    // 2.5e12 USD is 2,000 bn EUR at 1.25 USD per EUR.
    expect(symbols(filterStocks(list, { ...NO_FILTERS, capMin: 1000 }, fx))).toEqual(['BIG']);
  });

  it('sorts with unknown values last in both directions', () => {
    const options = { sort: 'pe' as const, fx, sectorName: (s: string) => s, locale: 'en' };
    expect(symbols(sortStocks(list, { ...options, desc: true }))).toEqual(['BIG', 'MID', 'BALT']);
    expect(symbols(sortStocks(list, { ...options, desc: false }))).toEqual(['MID', 'BIG', 'BALT']);
  });

  it('round-trips its state through the URL', () => {
    const state = parseState(new URLSearchParams('sec=T,F&reg=EU&pe=25&dir=up&sort=ret&order=asc&pick=msft,ASML&range=5Y&q=a'));
    expect(state).toMatchObject({ sectors: ['T', 'F'], regions: ['EU'], peMax: 25, direction: 'up', sort: 'ret', desc: false, picks: ['MSFT', 'ASML.AS'], range: '5Y', query: 'a' });
    expect(parseState(toSearchParams(state))).toEqual(state);
  });

  it('keeps the URL empty for the defaults and remembers cleared picks', () => {
    const defaults = parseState(new URLSearchParams());
    expect(toSearchParams(defaults).toString()).toBe('');
    expect(parseState(toSearchParams({ ...defaults, picks: [] })).picks).toEqual([]);
  });
});

describe('my list', () => {
  it('reads decimals with a comma or a point', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal(' 1 234,56 ')).toBe(1234.56);
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('12')).toBe(12);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });

  it('accepts only real calendar dates', () => {
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('28.02.2026')).toBe(false);
  });

  it('keeps catalogue stocks and drops bad fields', () => {
    expect(cleanEntry({ symbol: 'aapl', quantity: 2, buyPrice: 150.5, buyDate: '2025-03-01', note: '  first buy ' }))
      .toEqual({ symbol: 'AAPL', quantity: 2, buyPrice: 150.5, buyDate: '2025-03-01', note: 'first buy' });
    expect(cleanEntry({ symbol: 'AAPL', quantity: -1, buyPrice: 'x', buyDate: 'soon', note: 7 })).toEqual({ symbol: 'AAPL' });
    expect(cleanEntry({ symbol: 'NOPE' })).toBeNull();
    expect(cleanEntry({ symbol: 'NDX' })).toBeNull();
    expect(cleanEntry('AAPL')).toBeNull();
  });

  it('survives corrupt, foreign and duplicated data', () => {
    expect(parseList(null)).toEqual({ entries: [], skipped: 0 });
    expect(parseList('{not json')).toEqual({ entries: [], skipped: 0 });
    expect(parseList('{"version":2,"entries":[{"symbol":"AAPL"}]}')).toEqual({ entries: [], skipped: 0 });
    expect(parseList('{"version":1,"entries":[{"symbol":"AAPL"},{"symbol":"AAPL","quantity":3},{"symbol":"NOPE"},null]}'))
      .toEqual({ entries: [{ symbol: 'AAPL' }], skipped: 3 });
  });

  it('round-trips through its stored form', () => {
    const entries = [{ symbol: 'AAPL', quantity: 1.5, buyPrice: 200 }, { symbol: 'ASML.AS' }];
    expect(parseList(serializeList(entries))).toEqual({ entries, skipped: 0 });
  });

  it('adds new stocks and replaces existing ones', () => {
    const entries = upsert([{ symbol: 'AAPL' }], { symbol: 'MSFT' });
    expect(upsert(entries, { symbol: 'AAPL', quantity: 1, buyPrice: 2 })).toEqual([{ symbol: 'AAPL', quantity: 1, buyPrice: 2 }, { symbol: 'MSFT' }]);
  });

  const quotes = [
    stock({ symbol: 'A', price: 125, changePct: 1 }),
    stock({ symbol: 'B', currency: 'EUR', price: 10, changePct: 3 }),
    stock({ symbol: 'C', price: 50, changePct: -2 }),
  ];
  const entries = [{ symbol: 'C' }, { symbol: 'B', quantity: 50, buyPrice: 8 }, { symbol: 'A', quantity: 10, buyPrice: 150 }, { symbol: 'GONE' }];
  const valuation = valuePortfolio(entries, quotes, fx);
  const rows = listRows(entries, quotes, valuation);
  const order = (key: Parameters<typeof sortRows>[1]) => sortRows(rows, key).map((r) => r.entry.symbol);

  it('leaves watched stocks out of value, cost, gain and weights', () => {
    expect(valuation.positions.map((p) => p.stock.symbol)).toEqual(['A', 'B']);
    expect(valuation.totalEur).toBe(1500);
    expect(valuation.costEur).toBe(1600);
    expect(valuation.gainEur).toBe(-100);
    expect(valuation.positions[0].gainEur).toBe(-200);
    expect(valuation.positions.reduce((sum, p) => sum + p.weight, 0)).toBe(1);
    expect(allocation(valuation, 0).map((s) => s.sector)).toEqual(['T']);
  });

  it('values nothing when every stock is only watched', () => {
    const watched = valuePortfolio([{ symbol: 'A' }, { symbol: 'B' }], quotes, fx);
    expect(watched.positions).toEqual([]);
    expect(watched.totalEur).toBe(0);
    expect(watched.gainPct).toBe(0);
    expect(watched.dayPct).toBe(0);
  });

  it('pairs every entry with its quote and position', () => {
    expect(rows.map((r) => [r.entry.symbol, !!r.stock, !!r.position])).toEqual([['C', true, false], ['B', true, true], ['A', true, true], ['GONE', false, false]]);
  });

  it('sorts largest first with rows lacking the figure last', () => {
    expect(order('value')).toEqual(['A', 'B', 'C', 'GONE']);
    expect(order('gain')).toEqual(['B', 'A', 'C', 'GONE']);
    expect(order('gainPct')).toEqual(['B', 'A', 'C', 'GONE']);
    expect(order('day')).toEqual(['B', 'A', 'C', 'GONE']);
    expect(order('symbol')).toEqual(['A', 'B', 'C', 'GONE']);
  });
});

describe('chart touch gestures', () => {
  it('waits for a finger to leave the slop before deciding where it is heading', () => {
    expect(dragAxis(0, 0)).toBeNull();
    expect(dragAxis(3, -4)).toBeNull();
    expect(dragAxis(4, 4, 6)).toBeNull();
  });

  it('gives sideways drags to the chart and up-down drags to the page', () => {
    expect(dragAxis(12, 3)).toBe('x');
    expect(dragAxis(-12, -3)).toBe('x');
    expect(dragAxis(3, 12)).toBe('y');
    expect(dragAxis(-2, -30)).toBe('y');
    expect(dragAxis(8, 8)).toBe('x');
  });

  it('counts a tap as on the bubble only within reach of it', () => {
    expect(onBubble(150, 0.5, 300)).toBe(true);
    expect(onBubble(170, 0.5, 300)).toBe(true);
    expect(onBubble(180, 0.5, 300)).toBe(false);
    expect(onBubble(120, 0.5, 300, 40)).toBe(true);
    expect(onBubble(150, undefined, 300)).toBe(false);
  });
});

describe('period returns', () => {
  const DAY = 24 * 3600 * 1000;
  const now = Date.UTC(2026, 10, 10, 12);
  const bar = (daysAgo: number, c: number): Candle => ({ t: now - daysAgo * DAY, o: c, h: c, l: c, c, v: null });
  const candles = [bar(400, 50), bar(40, 80), bar(8, 100), bar(3, 104), bar(1, 108)];

  it('measures from the last close before the period starts', () => {
    expect(returnSince(candles, periodStart('1W', now), 110)).toBeCloseTo(10);
    expect(returnSince(candles, periodStart('1M', now), 110)).toBeCloseTo(37.5);
    expect(returnSince(candles, periodStart('1Y', now), 110)).toBeCloseTo(120);
    expect(returnSince(candles, periodStart('1W', now), 90)).toBeCloseTo(-10);
  });

  it('starts the year-to-date period on 1 January', () => {
    expect(periodStart('YTD', now)).toBe(Date.UTC(2026, 0, 1));
    expect(returnSince(candles, periodStart('YTD', now), 110)).toBeCloseTo(120);
  });

  it('gives no figure when the history is shorter than the period', () => {
    expect(returnSince(candles, periodStart('5Y', now), 110)).toBeNull();
    expect(returnSince([], periodStart('1W', now), 110)).toBeNull();
  });

  it('places a price inside a range', () => {
    expect(rangePosition(100, 200, 150)).toBe(50);
    expect(rangePosition(100, 200, 250)).toBe(100);
    expect(rangePosition(100, 100, 100)).toBeNull();
  });
});

describe('quarterly results', () => {
  const revenue = [{ period: '3/28/2026', value: 100 }, { period: '6/27/2026', value: 110 }, { period: '9/26/2026', value: 99 }];
  const eps = [{ period: 'Jun 2026', value: 1.9, estimate: 2 }, { period: 'Sep 2026', value: 2.2, estimate: 2 }];

  it('joins revenue and EPS by quarter, latest first', () => {
    const rows = quarterRows(revenue, eps);
    expect(rows.map((r) => r.time)).toEqual([Date.UTC(2026, 8), Date.UTC(2026, 5), Date.UTC(2026, 2)]);
    expect(rows[0].revenueChange).toBeCloseTo(-10);
    expect(rows[0].surprise).toBeCloseTo(10);
    expect(rows[1].surprise).toBeCloseTo(-5);
  });

  it('leaves gaps empty instead of guessing', () => {
    const oldest = quarterRows(revenue, eps)[2];
    expect(oldest).toMatchObject({ revenue: 100, revenueChange: null, eps: null, estimate: null, surprise: null });
    expect(quarterRows([], [{ period: 'Sep 2026', value: 1 }])[0]).toMatchObject({ revenue: null, eps: 1, surprise: null });
  });
});

describe('company summary', () => {
  it('keeps at most three sentences', () => {
    expect(shortSummary('One is here. Two is here. Three is here. Four is here.')).toBe('One is here. Two is here. Three is here.');
  });

  it('does not break after abbreviations and initials', () => {
    const text = 'Apple Inc. is based in the U.S. It makes phones. ASML Holding N.V. is Dutch. Fourth sentence.';
    expect(shortSummary(text)).toBe('Apple Inc. is based in the U.S. It makes phones. ASML Holding N.V. is Dutch. Fourth sentence.');
    expect(shortSummary('Nuo 2020 m. spalio 7 d. akcijos kotiruojamos. Grupė veikia Lietuvoje.', 50)).toBe('Nuo 2020 m. spalio 7 d. akcijos kotiruojamos.');
  });

  it('stops before the character limit at a sentence end', () => {
    expect(shortSummary('First sentence here. Second sentence is far too long to fit.', 40)).toBe('First sentence here.');
  });

  it('cuts one overlong sentence at a word', () => {
    expect(shortSummary('A single sentence that simply never seems to end, whatever happens', 30)).toBe('A single sentence that simply…');
  });
});

describe('market hours', () => {
  it('knows when any tracked market is trading', () => {
    expect(anyMarketOpen(new Date('2026-11-10T09:00:00Z'))).toBe(true);
    expect(anyMarketOpen(new Date('2026-11-10T20:30:00Z'))).toBe(true);
    expect(anyMarketOpen(new Date('2026-11-10T23:00:00Z'))).toBe(false);
    expect(anyMarketOpen(new Date('2026-11-14T12:00:00Z'))).toBe(false);
  });
});
