import { describe, expect, it } from 'vitest';
import type { FxRates, History, StockSummary } from '../shared/types';
import { nearestIndex, pointDiff } from '../src/lib/chart';
import { createFormat } from '../src/lib/format';
import { bollinger, niceTicks, rsi, sma } from '../src/lib/indicators';
import { barometer, sectorMoves } from '../src/lib/market';
import { alertState, portfolioReturns, valuePortfolio } from '../src/lib/portfolio';
import { filterStocks, NO_FILTERS, parseState, sortStocks, toSearchParams } from '../src/lib/screener';
import { alignCloses } from '../src/lib/series';

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
  const holdings = [{ symbol: 'A', quantity: 10, avgCost: 100 }, { symbol: 'B', quantity: 50, avgCost: 8 }, { symbol: 'GONE', quantity: 1, avgCost: 1 }];
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

  it('reports how close an alert is', () => {
    const near = alertState({ symbol: 'A', type: 'priceAbove', value: 130 }, quotes[0]);
    expect(near.status).toBe('active');
    expect(near.distancePct).toBeCloseTo(4);
    expect(alertState({ symbol: 'A', type: 'priceAbove', value: 120 }, quotes[0]).status).toBe('reached');
    expect(alertState({ symbol: 'A', type: 'priceBelow', value: 120, paused: true }, quotes[0]).status).toBe('paused');
    expect(alertState({ symbol: 'A', type: 'dailyMove', value: 5 }, quotes[0]).status).toBe('reached');
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
