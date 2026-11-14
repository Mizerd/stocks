import { describe, expect, it } from 'vitest';
import type { HeatmapMeta } from '../shared/heatmap';
import type { FxRates, Region, StockSummary } from '../shared/types';
import { buildBoard, colourStep, layoutBoard, type Board } from '../src/lib/heatmap';

const fx: FxRates = { date: '2026-11-13', perEur: { EUR: 1, USD: 1.25, SEK: 10 } };

function stock(symbol: string, fields: Partial<StockSummary> = {}): StockSummary {
  const region: Region = symbol.includes('.') ? 'EU' : 'US';
  return {
    symbol, name: symbol, kind: 'stock', exchange: region === 'US' ? 'XNAS' : 'XAMS', currency: region === 'US' ? 'USD' : 'EUR', region,
    sector: 'T', provider: region === 'US' ? 'nasdaq' : 'euronext', price: 10, change: 0.1, changePct: 1, prevClose: 9.9,
    open: null, high: null, low: null, volume: 100, time: '2026-11-13T21:00:00.000Z', freshness: 'realtime', marketCap: null,
    pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null, high52: null, low52: null, return1Y: null, spark: [],
    ...fields,
  };
}

const meta = (stocks: HeatmapMeta['stocks']): HeatmapMeta => ({
  built: '2026-11-14', sharesAsOf: { nordic: '2026-11-14', euronext: '2026-11-14', baltic: '2026-11-13' }, stocks,
});

describe('heatmap colour steps', () => {
  it('bins the day\'s move on fixed edges', () => {
    expect(colourStep(0, 0)).toBe('none');
    expect(colourStep(0, 120)).toBe('flat');
    expect(colourStep(0.001, null)).toBe('flat');
    expect(colourStep(0.24, 1)).toBe('u1');
    expect(colourStep(0.25, 1)).toBe('u2');
    expect(colourStep(-0.5, 1)).toBe('d3');
    expect(colourStep(1.99, 1)).toBe('u4');
    expect(colourStep(3, 1)).toBe('u6');
    expect(colourStep(-13.4, 1)).toBe('d6');
  });
});

describe('heatmap board', () => {
  it('sizes US stocks by Nasdaq\'s market value and skips a second share class', () => {
    const board = buildBoard(
      [stock('GOOGL', { marketCap: 3.6e12 }), stock('GOOG', { marketCap: 3.6e12 }), stock('AAPL', { marketCap: 5e12 })],
      meta({ GOOG: { industry: '101010', secondary: true }, GOOGL: { industry: '101010' }, AAPL: { industry: '101020' } }),
      fx, 'cap', 500,
    );
    const tiles = board.sectors.flatMap((s) => s.industries.flatMap((i) => i.tiles));
    expect(tiles.map((t) => t.stock.symbol)).toEqual(['AAPL', 'GOOGL']);
    expect(tiles[0]).toMatchObject({ value: 5e12, currency: 'USD', weight: 5e12 });
    expect(board.total).toBe(2);
  });

  it('values European lines as shares times price in euros', () => {
    const board = buildBoard([stock('VOLV-B.ST', { currency: 'SEK', price: 300, exchange: 'XSTO' })], meta({ 'VOLV-B.ST': { industry: '4010', shares: 1e9 } }), fx, 'cap', 300);
    expect(board.sectors[0].industries[0].tiles[0]).toMatchObject({ value: 3e10, currency: 'EUR' });
  });

  it('leaves stocks without a size out of the sized modes and counts them, but keeps them in equal mode', () => {
    const stocks = [stock('ASML.AS'), stock('NEW.AS')];
    const known = meta({ 'ASML.AS': { industry: '1010', shares: 1e6 } });
    const capped = buildBoard(stocks, known, fx, 'cap', 300);
    expect(capped).toMatchObject({ shown: 1, total: 2, unsized: 1 });
    const equal = buildBoard(stocks, known, fx, 'equal', 300);
    expect(equal).toMatchObject({ shown: 2, unsized: 0 });
    // Without its own industry a stock goes to its sector's "other" group.
    expect(equal.sectors[0].industries.map((i) => i.key).sort()).toEqual(['10', '1010']);
  });

  it('keeps the largest stocks up to the limit', () => {
    const stocks = [1, 5, 3, 4, 2].map((n) => stock(`S${'ABCDE'[n - 1]}`, { marketCap: n * 1e9 }));
    const board = buildBoard(stocks, null, fx, 'cap', 3);
    expect(board.sectors.flatMap((s) => s.industries.flatMap((i) => i.tiles.map((t) => t.stock.symbol)))).toEqual(['SE', 'SD', 'SC']);
    expect(board).toMatchObject({ shown: 3, total: 5 });
  });

  it('takes the top level from the ICB industry', () => {
    const board = buildBoard(
      [stock('ASML.AS', { sector: 'I' }), stock('V', { sector: 'D', marketCap: 1e12 })],
      meta({ 'ASML.AS': { industry: '1010', shares: 1e6 }, V: { industry: '3020' } }),
      fx, 'equal', 300,
    );
    expect(Object.fromEntries(board.sectors.map((s) => [s.industries[0].tiles[0].stock.symbol, s.sector]))).toEqual({ 'ASML.AS': 'T', V: 'F' });
  });

  it('averages a sector\'s move by weight, leaving out stocks without trades', () => {
    const board = buildBoard(
      [stock('A', { marketCap: 3e9, changePct: 2 }), stock('B', { marketCap: 1e9, changePct: -2 }), stock('C', { marketCap: 4e9, changePct: 0, volume: 0 })],
      null, fx, 'cap', 500,
    );
    expect(board.sectors[0].changePct).toBeCloseTo(1);
    expect(board.sectors[0].industries[0].tiles.find((t) => t.stock.symbol === 'C')?.step).toBe('none');
  });
});

describe('heatmap layout', () => {
  const sizes = [400, 200, 120, 90, 60, 40, 30, 20, 10, 8, 5, 3, 2, 1];
  const board: Board = buildBoard(
    sizes.map((n, i) => stock(`S${String.fromCharCode(65 + i)}`, { marketCap: n * 1e9, sector: (['T', 'F', 'H'] as const)[i % 3] })),
    meta(Object.fromEntries(sizes.map((_, i) => [`S${String.fromCharCode(65 + i)}`, { industry: ['101010', '101020', '3010', '201030'][i % 4] }]))),
    fx, 'cap', 500,
  );

  it('keeps every tile inside the board, with finite sizes', () => {
    for (const width of [1440, 820, 390]) {
      const placed = layoutBoard(board, width, width < 560);
      expect(placed.tiles).toHaveLength(sizes.length);
      for (const { x, y, w, h } of placed.tiles) {
        expect([x, y, w, h].every(Number.isFinite)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(width + 0.5);
        expect(y + h).toBeLessThanOrEqual(placed.height + 0.5);
      }
    }
  });

  it('sizes tiles in proportion within an industry', () => {
    const placed = layoutBoard(board, 1440, false);
    const tech = placed.tiles.filter((p) => p.tile.industry === '101010');
    const [a, b] = tech;
    expect((a.w * a.h) / (b.w * b.h)).toBeCloseTo(a.tile.weight / b.tile.weight, 0);
  });

  it('picks what a tile shows by its size', () => {
    const placed = layoutBoard(board, 1440, false);
    for (const { w, h, tier } of placed.tiles) {
      if (tier === 'xl') expect(w >= 110 && h >= 80).toBe(true);
      if (tier === 's') expect(w < 30 || h < 16).toBe(true);
    }
    expect(placed.tiles[0].tier).toBe('xl');
  });

  it('grows the stacked layout with the number of sectors, and draws nothing without a width', () => {
    const one = buildBoard([stock('A', { marketCap: 1e9 })], null, fx, 'cap', 500);
    expect(layoutBoard(board, 358, true).height).toBeGreaterThan(layoutBoard(one, 358, true).height);
    expect(layoutBoard(board, 0, true)).toEqual({ sectors: [], industries: [], tiles: [], height: 0 });
    expect(layoutBoard(board, 1440, false).height).toBe(720);
    expect(layoutBoard(board, 600, false).height).toBe(420);
  });
});
