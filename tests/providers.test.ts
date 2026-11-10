import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { num } from '../worker/http';
import { STOCKS } from '../shared/catalog';
import { baltic, parseBalticShareList, parseBalticXlsx } from '../worker/providers/baltic';
import { parseEcbRates } from '../worker/providers/ecb';
import { parseEuronextCsv } from '../worker/providers/euronext';
import { bucket, parseNasdaqRows, parseNasdaqTime } from '../worker/providers/nasdaq';
import { parseNewsFeed } from '../worker/providers/news';
import { parseNordicChart } from '../worker/providers/nordic';

describe('num', () => {
  it('reads provider number formats', () => {
    expect(num('$1,234.50')).toBe(1234.5);
    expect(num('+0.19%')).toBe(0.19);
    expect(num('-2.70')).toBe(-2.7);
    expect(num('DKK 272.35')).toBe(272.35);
  });

  it('returns null for missing values instead of zero', () => {
    expect(num('--')).toBeNull();
    expect(num('N/A')).toBeNull();
    expect(num('')).toBeNull();
    expect(num(undefined)).toBeNull();
  });
});

describe('Nasdaq', () => {
  it('parses historical rows oldest first', () => {
    const candles = parseNasdaqRows([
      { date: '11/09/2026', close: '$350.69', volume: '48,753,050', open: '$344.995', high: '$352.33', low: '$344.78' },
      { date: '11/06/2026', close: '$342.37', volume: '44,703,810', open: '$338.73', high: '$345.79', low: '$338.30' },
    ]);
    expect(candles.map((c) => c.c)).toEqual([342.37, 350.69]);
    expect(candles[1]).toEqual({ t: Date.UTC(2026, 10, 9), o: 344.995, h: 352.33, l: 344.78, c: 350.69, v: 48753050 });
  });

  it('keeps index rows that have no volume', () => {
    const [candle] = parseNasdaqRows([{ date: '11/09/2026', close: '27,907.62', volume: '--', open: '27,263.43', high: '28,025.77', low: '27,227.53' }]);
    expect(candle.v).toBeNull();
    expect(candle.c).toBe(27907.62);
  });

  it('reads New York timestamps as instants', () => {
    // November is standard time, UTC-5.
    expect(parseNasdaqTime('Nov 10, 2026 9:34 AM ET')).toBe('2026-11-10T14:34:00.000Z');
    // July is daylight time, UTC-4.
    expect(parseNasdaqTime('Jul 1, 2026 3:59 PM ET')).toBe('2026-07-01T19:59:00.000Z');
  });

  it('buckets ticks into five-minute bars', () => {
    const minute = 60000;
    const bars = bucket([
      { t: 0, price: 10 }, { t: 2 * minute, price: 12 }, { t: 4 * minute, price: 11 }, { t: 5 * minute, price: 13 },
    ], 5);
    expect(bars).toEqual([
      { t: 0, o: 10, h: 12, l: 10, c: 11, v: null },
      { t: 5 * minute, o: 13, h: 13, l: 13, c: 13, v: null },
    ]);
  });
});

describe('Nasdaq Nordic', () => {
  it('parses daily chart points', () => {
    const [candle] = parseNordicChart([
      { z: { dateTime: '2026-10-26', value: '260.45', high: '263.30', low: '259.85', open: '260.70', close: '260.45', volume: '3,209,440' }, x: 1792972800, y: 260.45 },
    ]);
    expect(candle).toEqual({ t: 1792972800000, o: 260.7, h: 263.3, l: 259.85, c: 260.45, v: 3209440 });
  });
});

describe('Euronext', () => {
  const csv = [
    '﻿"Historical Data"', '"From 2026-11-05 to 2026-11-10"', 'NL0010273215',
    'Date;Open;High;Low;Last;Close;"Number of Shares";"Number of Trades";Turnover;vwap',
    '09/11/2026;1280.00;1357.20;1271.60;1343.80;1343.80;765279;51332;1016087140;1327.7346',
    '06/11/2026;1250.00;1307.40;1233.00;1283.60;1283.60;1171371;86839;1501343994;1281.6981',
  ].join('\n');

  it('parses the historical price download oldest first', () => {
    const candles = parseEuronextCsv(csv);
    expect(candles).toHaveLength(2);
    expect(candles[1]).toEqual({ t: Date.UTC(2026, 10, 9), o: 1280, h: 1357.2, l: 1271.6, c: 1343.8, v: 765279 });
  });

  it('falls back to the close when a day had no trades', () => {
    const [candle] = parseEuronextCsv('09/11/2026;0.00;0.00;0.00;0.00;211.55;0;0;0;0.0000');
    expect(candle).toMatchObject({ o: 211.55, h: 211.55, l: 211.55, c: 211.55, v: null });
  });
});

describe('Nasdaq Baltic', () => {
  it('parses the share list by ISIN', () => {
    const html = `Last update: 10.11.2026 16:22 (GMT+2)
      <tr> <td data-sort-by="Ignitis"><a href="/statistics/en/instrument/LT0000115768/trading">Ignitis grupė</a></td>
      <td><a href="/statistics/en/instrument/LT0000115768/trading">IGN1L</a></td>
      <td>21.45</td><td><span class="price-goes down">-0.05</span></td><td><span>-0.23</span></td>
      <td>21.45<br></td><td>21.45</td><td>344</td><td>16,933</td><td>363,159</td><td>21.5</td></tr>`;
    const list = parseBalticShareList(html);
    expect(list.asOf).toBe('10.11.2026 16:22');
    expect(list.rows.get('LT0000115768')).toEqual({ last: 21.45, change: -0.05, changePct: -0.23, volume: 16933, prevClose: 21.5 });
  });

  it('finds no rows in a refusal page', () => {
    expect(parseBalticShareList('<html>Request unsuccessful.</html>').rows.size).toBe(0);
  });

  it('falls back to the last daily close when the live list is refused', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>Request unsuccessful.</html>');
    try {
      const day = 24 * 3600 * 1000;
      const t = Date.UTC(2026, 10, 9);
      const bars = [{ t, o: 20, h: 20, l: 20, c: 20, v: 10 }, { t: t + day, o: 20, h: 21, l: 20, c: 21, v: 30 }];
      const quote = await baltic.quote(STOCKS.find((s) => s.symbol === 'IGN1L.VS')!, bars);
      expect(quote).toMatchObject({ price: 21, change: 1, prevClose: 20, volume: 30, freshness: 'eod' });
      expect(quote.changePct).toBeCloseTo(5);
      expect(quote.time).toBe('2026-11-10T14:00:00.000Z');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('parses the price history spreadsheet', () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="F1" t="s"><v>5</v></c></row>
      <row r="2"><c r="A2"><v>46336.0</v></c><c r="C2"><v>21.45</v></c><c r="D2"><v>21.5</v></c><c r="E2"><v>21.4</v></c><c r="F2"><v>21.5</v></c><c r="G2"><v>21.45</v></c><c r="N2"><v>16933.0</v></c></row>
      <row r="3"><c r="A3"><v>46335.0</v></c><c r="C3"><v>21.55</v></c><c r="D3"><v>21.55</v></c><c r="E3"><v>21.45</v></c><c r="F3"><v>21.5</v></c><c r="N3"><v>5836.0</v></c></row>
    </sheetData></worksheet>`;
    const candles = parseBalticXlsx(zipSync({ 'xl/worksheets/sheet1.xml': strToU8(sheet) }));
    expect(candles).toHaveLength(2);
    expect(candles[1]).toEqual({ t: Date.UTC(2026, 10, 10), o: 21.45, h: 21.5, l: 21.4, c: 21.45, v: 16933 });
    // The older row has no Last price, so its Close is used.
    expect(candles[0].c).toBe(21.5);
  });
});

describe('ECB and news', () => {
  it('parses reference rates', () => {
    const rates = parseEcbRates("<Cube time='2026-11-09'><Cube currency='USD' rate='1.1193'/><Cube currency='DKK' rate='7.4753'/></Cube>");
    expect(rates).toEqual({ date: '2026-11-09', perEur: { EUR: 1, USD: 1.1193, DKK: 7.4753 } });
  });

  it('parses the RSS feed and drops unsafe links', () => {
    const xml = `<item><title><![CDATA[Annual report]]></title><link>https://view.news.eu.nasdaq.com/view?id=1&amp;lang=en</link>
      <pubDate>Tue, 10 Nov 2026 16:34:26 +0200</pubDate><issuer><![CDATA[Ignitis]]></issuer></item>
      <item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Tue, 10 Nov 2026 16:34:26 +0200</pubDate></item>`;
    expect(parseNewsFeed(xml)).toEqual([
      { title: 'Annual report', link: 'https://view.news.eu.nasdaq.com/view?id=1&lang=en', time: '2026-11-10T14:34:26.000Z', issuer: 'Ignitis' },
    ]);
  });
});
