import { describe, expect, it } from 'vitest';
import { num } from '../worker/http';
import { STOCKS } from '../shared/catalog';
import { baltic, balticListUrl, parseBalticCapitalization, parseBalticSheet, parseBalticShareList } from '../worker/providers/baltic';
import { parseEcbRates } from '../worker/providers/ecb';
import { liveQuote, parseAdmittedShares, parseEuronextCsv, parseEuronextList, parseIcbSupersector } from '../worker/providers/euronext';
import {
  bucket, companyName, nasdaq, parseEarningsDate, parseNasdaqInfo, parseNasdaqRows, parseNasdaqTime, parseNextDividend, parseUsScreener,
  parseWatchlist, sessionBar,
} from '../worker/providers/nasdaq';
import { parseNewsFeed } from '../worker/providers/news';
import { parseNordicChart, parseNordicScreener, parseNordicSummaryMeta } from '../worker/providers/nordic';
import { parseLangLink, parseSitelinks, parseSummary, wikidataQuery } from '../worker/providers/wikipedia';
import { unzipFile } from '../worker/unzip';
import { usLiveOrder, usMoreQuotes, type UsRow } from '../worker/universe';
import balticCapitalization from './fixtures/baltic-capitalization.html?raw';
import euronextIcb from './fixtures/euronext-icb.html?raw';
import euronextTradingInfo from './fixtures/euronext-tradinginfo.html?raw';
import nokiaSummary from './fixtures/nordic-summary-nokia.json';

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

  it('keeps one bar a minute for the one-day chart', () => {
    const minute = 60000;
    const bars = bucket([
      { t: 0, price: 10, volume: 5 }, { t: 20000, price: 11, volume: 1 }, { t: minute, price: 9 }, { t: 3 * minute, price: 12 },
    ], 1);
    expect(bars).toEqual([
      { t: 0, o: 10, h: 11, l: 10, c: 11, v: 6 },
      { t: minute, o: 9, h: 9, l: 9, c: 9, v: null },
      { t: 3 * minute, o: 12, h: 12, l: 12, c: 12, v: null },
    ]);
  });

  it('reads the one-day chart in New York time, one bar a minute, within the session', async () => {
    const realFetch = globalThis.fetch;
    // Wall-clock New York time written as if it were UTC, with seconds.
    const wall = (iso: string, y: number) => ({ x: Date.parse(iso), y });
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { previousClose: '1,000.00', chart: [
      wall('2026-07-01T09:29:00Z', 1), wall('2026-07-01T09:30:15Z', 2), wall('2026-07-01T16:00:00Z', 3), wall('2026-07-01T16:01:00Z', 4),
      wall('2026-11-10T09:31:40Z', 5),
    ] } }));
    try {
      const day = await nasdaq.intraday(STOCKS.find((s) => s.symbol === 'AAPL')!);
      expect(day!.prevClose).toBe(1000);
      // July is daylight time (UTC-4), November standard time (UTC-5).
      expect(day!.candles.map((c) => [new Date(c.t).toISOString(), c.c])).toEqual([
        ['2026-07-01T13:30:00.000Z', 2], ['2026-07-01T20:00:00.000Z', 3], ['2026-11-10T14:31:00.000Z', 5],
      ]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('keeps pre-market trades apart and skips the placeholder of a share without trades', async () => {
    const realFetch = globalThis.fetch;
    const wall = (iso: string, y: number) => ({ x: Date.parse(iso), y });
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { previousClose: '$355.36', chart: [
      wall('2026-11-13T03:59:00Z', 1), wall('2026-11-13T04:00:00Z', 356.1), wall('2026-11-13T07:16:00Z', 356.35), wall('2026-11-13T07:17:48Z', 0),
    ] } }));
    try {
      const day = await nasdaq.intraday(STOCKS.find((s) => s.symbol === 'AAPL')!);
      expect(day!.candles).toEqual([]);
      expect(day!.premarket!.map((c) => [new Date(c.t).toISOString(), c.c])).toEqual([
        ['2026-11-13T09:00:00.000Z', 356.1], ['2026-11-13T12:16:00.000Z', 356.35],
      ]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('reads the stock screener and leaves out preferreds, notes and warrants', () => {
    const rows = parseUsScreener({ data: { rows: [
      { symbol: 'AAPL', name: 'Apple Inc. Common Stock', lastsale: '$348.51', netchange: '-2.18', pctchange: '-0.622%', volume: '29756060', marketCap: '5064610748820.00', sector: 'Technology', industry: 'Computer Manufacturing' },
      { symbol: 'BRK/B', name: 'Berkshire Hathaway Inc.', lastsale: '$480.10', netchange: '1.2', pctchange: '0.25%', volume: '3000000', marketCap: '', sector: '', industry: '' },
      { symbol: 'GOOGM', name: 'Alphabet Inc. Depositary Shares representing a 1/20th Interest in a Share of Series A Mandatory Convertible Preferred Stock', lastsale: '$52.00', netchange: '0', pctchange: '0%', volume: '1', marketCap: '1', sector: 'Technology', industry: '' },
      { symbol: 'DUKB', name: 'Duke Energy Corporation 5.625% Junior Subordinated Debentures due 2078', lastsale: '$25.00', netchange: '0', pctchange: '0%', volume: '1', marketCap: '1', sector: 'Utilities', industry: '' },
      { symbol: 'OXY.WS', name: 'Occidental Petroleum Corporation Warrants ', lastsale: '$30.00', netchange: '0', pctchange: '0%', volume: '1', marketCap: '1', sector: 'Energy', industry: '' },
      { symbol: 'NEWCO', name: 'Newco Inc. Common Stock', lastsale: 'NA', netchange: '', pctchange: '', volume: '', marketCap: '', sector: '', industry: '' },
    ] } });
    expect(rows.map((r) => r.ticker)).toEqual(['AAPL', 'BRK/B']);
    expect(rows[0]).toEqual({
      ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Computer Manufacturing',
      price: 348.51, change: -2.18, changePct: -0.622, volume: 29756060, marketCap: 5064610748820,
    });
    expect(rows[1].marketCap).toBeNull();
  });

  it('reads live watchlist quotes', () => {
    const rows = parseWatchlist({ data: [
      { symbol: 'AAPL', lastSalePrice: '$352.10', netChange: '+3.59', percentageChange: '+1.03%', volume: '2,954,240', lastTradeTimestampDateTime: '2026-11-11T09:39:33.351753-05:00' },
      { symbol: 'NOPE', lastSalePrice: 'N/A', netChange: '', percentageChange: '', volume: '', lastTradeTimestampDateTime: null },
    ] });
    expect(rows).toEqual([
      { ticker: 'AAPL', price: 352.1, change: 3.59, changePct: 1.03, volume: 2954240, time: '2026-11-11T14:39:33.351Z' },
    ]);
  });

  it('reads a watchlist quote after the close, when Nasdaq gives the date alone, as the 16:00 close', () => {
    const [row] = parseWatchlist({ data: [
      { symbol: 'AAPL', lastSalePrice: '$356.27', netChange: '+1.39', percentageChange: '+0.39%', volume: '40,027,467', lastTradeTimestamp: 'Nov 13, 2026', lastTradeTimestampDateTime: '2026-11-13T00:00:00' },
    ] });
    expect(row.time).toBe('2026-11-13T21:00:00.000Z');
  });

  it('drops a watchlist row without any readable time', () => {
    expect(parseWatchlist({ data: [{ symbol: 'X', lastSalePrice: '$1', lastTradeTimestamp: '', lastTradeTimestampDateTime: '2026-11-13T00:00:00' }] })).toEqual([]);
  });

  it('drops the share class from company names', () => {
    expect(companyName('Alphabet Inc. Class C Capital Stock')).toBe('Alphabet Inc.');
    expect(companyName('Sea Limited American Depositary Shares each representing one Class A Ordinary Share')).toBe('Sea Limited');
    expect(companyName('Iron Mountain Incorporated (Delaware)Common Stock REIT')).toBe('Iron Mountain Incorporated');
    expect(companyName('Brookfield Corporation Class A Limited Voting Shares')).toBe('Brookfield Corporation');
    expect(companyName('Commonwealth Bank')).toBe('Commonwealth Bank');
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

describe('Nasdaq Nordic screener', () => {
  it('reads every share of a market with its last price', () => {
    const [row, idle] = parseNordicScreener({ data: { instrumentListing: { rows: [
      { fullName: 'Volvo B', symbol: 'VOLV B', orderbookId: 'SSE366', isin: 'SE0000115446', currency: 'SEK', lastSalePrice: '323.60', netChange: '+2.40', percentageChange: '+0.74%', volume: '918,123', sector: 'Industrials' },
      { fullName: 'Dovre Group', symbol: 'DOV1V', orderbookId: 'TX1', isin: 'FI0009008098', currency: 'EUR', lastSalePrice: '', netChange: '', percentageChange: '', volume: '', sector: 'Energy' },
    ] } } });
    expect(row).toEqual({
      orderbookId: 'SSE366', ticker: 'VOLV B', name: 'Volvo B', isin: 'SE0000115446', currency: 'SEK', sector: 'Industrials',
      price: 323.6, change: 2.4, changePct: 0.74, volume: 918123,
    });
    expect(idle.price).toBeNull();
  });
});

describe('Euronext', () => {
  it('reads the live stock list for the wanted lines only', () => {
    const cell = (price: string, pct: string, time: string, day: string) => [
      `<div class="text-right pd_currency_es">EUR <span class="pd_last_price_es">${price}</span></div>`,
      `<div class="text-right pd_percent"><span class=text-brand-kelly-green>${pct}</span></div>`,
      `<div class="text-right pointer tooltipDesign">${time} CET<span class="tooltiptext">${day}</span></div>`,
    ];
    const rows = parseEuronextList({ aaData: [
      ['<a href="/en/product/equities/NL0010273215-XAMS">ASML HOLDING</a>', 'NL0010273215', 'ASML', 'XAMS', ...cell('1,402.20', '3.03%', '14:11', '11 Nov 2026')],
      ['<a href="/en/product/equities/NL0000313286-XAMS">ACOMO</a>', 'NL0000313286', 'ACOMO', 'XAMS', ...cell('23.15', '-', '14:03', '11 Nov 2026')],
      ['<a href="/en/product/equities/NL00150002R5-XAMS">CABKA</a>', 'NL00150002R5', 'DSC2S', 'XAMS', '<div>-</span></div>', '<div>-</div>', '<div>-<span class="tooltiptext"></span></div>'],
    ] }, 'XAMS', new Set(['NL0010273215-XAMS', 'NL00150002R5-XAMS']));
    expect(Object.keys(rows)).toEqual(['NL0010273215-XAMS']);
    // 14:11 in Amsterdam in November is 13:11 UTC.
    expect(rows['NL0010273215-XAMS']).toEqual({ price: 1402.2, changePct: 3.03, time: '2026-11-11T13:11:00.000Z' });
  });

  it('reads the list when the date comes before the time', () => {
    const rows = parseEuronextList({ aaData: [
      ['<a>74SOFTWARE</a>', 'FR0011040500', '74SW', '<div>XPAR</div>', '<div class="text-right pd_currency_es">EUR <span class="pd_last_price_es">34.30</span></div>',
        '<div class="text-right pd_percent"><span class=red>-0.29%</span></div>',
        '<div class="text-right pointer tooltipDesign">13 Nov 2026<span class="tooltiptext">17:35 CET</span></div>'],
    ] }, 'XPAR', new Set(['FR0011040500-XPAR']));
    expect(rows['FR0011040500-XPAR']).toEqual({ price: 34.3, changePct: -0.29, time: '2026-11-13T16:35:00.000Z' });
  });

  it('works out the change from the price and the percentage', () => {
    expect(liveQuote({ price: 110, changePct: 10, time: '' })).toEqual({ price: 110, change: 10, changePct: 10 });
  });

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
      <td>21.45<br></td><td>21.45</td><td>344</td><td>16,933</td><td>363,159</td><td>21.5</td>
      <td class="d-none text12"><span title="Utilities " data-toggle="tooltip">UTI</span></td>
      <td class="d-none text12"><span title="Utilities" data-toggle="tooltip">UTI</span></td><td class="d-none">VLN</td></tr>
      <tr><td data-sort-by="Pieno &amp; žvaigždės"><a href="/statistics/en/instrument/LT0000111676/trading">Pieno žvaigždės</a></td>
      <td><a href="/statistics/en/instrument/LT0000111676/trading">PZV1L</a></td>
      <td>2.1</td><td></td><td></td><td>2</td><td>2.2</td><td>0</td><td>0</td><td>0</td><td>2.1</td>
      <td><span title="Consumer Staples">CON</span></td><td><span title="Food">FOO</span></td><td>VLN</td></tr>`;
    const list = parseBalticShareList(html);
    expect(list.asOf).toBe('10.11.2026 16:22');
    expect(list.rows['LT0000115768']).toEqual({
      isin: 'LT0000115768', ticker: 'IGN1L', name: 'Ignitis', industry: 'Utilities', supersector: 'Utilities', home: 'VLN',
      last: 21.45, change: -0.05, changePct: -0.23, volume: 16933, prevClose: 21.5,
    });
    // No trade today: the last price stays, the change is unknown.
    expect(list.rows['LT0000111676']).toMatchObject({ name: 'Pieno & žvaigždės', last: 2.1, change: null, volume: 0 });
  });

  it('asks for the latest session by date until today\'s session has started', () => {
    // Saturday, and Monday 09:00 in Vilnius before the open: Friday's list.
    expect(balticListUrl(new Date('2026-11-14T10:00:00Z'))).toMatch(/\/shares\?date=2026-11-13$/);
    expect(balticListUrl(new Date('2026-11-16T07:00:00Z'))).toMatch(/\/shares\?date=2026-11-13$/);
    // In the session and after its close the same day: the plain page.
    expect(balticListUrl(new Date('2026-11-16T10:00:00Z'))).toMatch(/\/shares$/);
    expect(balticListUrl(new Date('2026-11-16T17:00:00Z'))).toMatch(/\/shares$/);
  });

  it('finds no rows in a refusal page', () => {
    expect(parseBalticShareList('<html>Request unsuccessful.</html>').rows).toEqual({});
  });

  it('falls back to the last daily close when the live list is refused', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>Request unsuccessful.</html>');
    try {
      const day = 24 * 3600 * 1000;
      const t = Date.UTC(2026, 10, 9);
      const bars = [{ t, o: 20, h: 20, l: 20, c: 20, v: 10 }, { t: t + day, o: 20, h: 21, l: 20, c: 21, v: 30 }];
      const quote = await baltic.quote(STOCKS.find((s) => s.symbol === 'IGN1L.VS')!, Promise.resolve(bars));
      expect(quote).toMatchObject({ price: 21, change: 1, prevClose: 20, volume: 30, freshness: 'eod' });
      expect(quote.changePct).toBeCloseTo(5);
      expect(quote.time).toBe('2026-11-10T14:00:00.000Z');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('parses the price history sheet', () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="F1" t="s"><v>5</v></c></row>
      <row r="2"><c r="A2"><v>46336.0</v></c><c r="C2"><v>21.45</v></c><c r="D2"><v>21.5</v></c><c r="E2"><v>21.4</v></c><c r="F2"><v>21.5</v></c><c r="G2"><v>21.45</v></c><c r="N2"><v>16933.0</v></c></row>
      <row r="3"><c r="A3"><v>46335.0</v></c><c r="C3"><v>21.55</v></c><c r="D3"><v>21.55</v></c><c r="E3"><v>21.45</v></c><c r="F3"><v>21.5</v></c><c r="N3"><v>5836.0</v></c></row>
    </sheetData></worksheet>`;
    const candles = parseBalticSheet(sheet);
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

describe('Wikidata', () => {
  const inst = (over: object) => ({ ...STOCKS[0], wiki: undefined, ...over });

  it('finds a company by ISIN, or by name and exchange in the US', () => {
    expect(wikidataQuery(inst({ provider: 'baltic', providerId: 'LT0000115768' }))).toBe('haswbstatement:P946=LT0000115768');
    expect(wikidataQuery(inst({ provider: 'euronext', providerId: 'FR0000121014-XPAR' }))).toBe('haswbstatement:P946=FR0000121014');
    expect(wikidataQuery(inst({ provider: 'nordic', providerId: 'SSE366', isin: 'SE0000115446' }))).toBe('haswbstatement:P946=SE0000115446');
    expect(wikidataQuery(inst({ name: 'Agilent Technologies Inc.', exchange: 'XNYS' }))).toBe('Agilent Technologies Inc. haswbstatement:P414=Q13677');
  });

  it('reads the English and Lithuanian article titles', () => {
    const body = { entities: { Q52618: { sitelinks: { enwiki: { title: 'Ericsson' }, ltwiki: { title: 'Ericsson' } } } } };
    expect(parseSitelinks(body)).toEqual({ en: 'Ericsson', lt: 'Ericsson' });
    expect(parseSitelinks({ entities: { Q1: { sitelinks: {} } } })).toEqual({ en: null, lt: null });
  });
});

describe('Wikipedia', () => {
  const page = {
    type: 'standard',
    description: 'Dutch photolithography company',
    extract: 'ASML Holding N.V. is a Dutch company.\nIt makes lithography machines.',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/ASML' } },
  };

  it('reads a page summary', () => {
    expect(parseSummary(JSON.stringify(page), 'en')).toEqual({
      extract: 'ASML Holding N.V. is a Dutch company. It makes lithography machines.',
      description: 'Dutch photolithography company',
      url: 'https://en.wikipedia.org/wiki/ASML',
      lang: 'en',
    });
  });

  it('rejects disambiguation pages, empty extracts and foreign links', () => {
    expect(parseSummary(JSON.stringify({ ...page, type: 'disambiguation' }), 'en')).toBeNull();
    expect(parseSummary(JSON.stringify({ ...page, extract: '' }), 'en')).toBeNull();
    expect(parseSummary(JSON.stringify({ ...page, content_urls: { desktop: { page: 'https://example.com/ASML' } } }), 'en')).toBeNull();
    expect(parseSummary(JSON.stringify(page), 'lt')).toBeNull();
  });

  it('finds the Lithuanian article of an English page', () => {
    const linked = { query: { pages: { 123: { title: 'Ignitis', langlinks: [{ lang: 'lt', '*': 'Ignitis grupė' }] } } } };
    expect(parseLangLink(JSON.stringify(linked))).toBe('Ignitis grupė');
    expect(parseLangLink(JSON.stringify({ query: { pages: { 123: { title: 'ASML' } } } }))).toBeNull();
    expect(parseLangLink(JSON.stringify({ batchcomplete: '' }))).toBeNull();
  });
});

// A minimal zip archive: local headers, file data, central directory and end record (CRCs left at zero).
async function zipOf(files: Record<string, string>, deflate: boolean): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = encoder.encode(text);
    const data = deflate
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    const fileName = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, fileName.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, deflate ? 8 : 0, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, fileName.length, true);
    entry.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), fileName, data);
    directory.push(new Uint8Array(entry.buffer), fileName);
    offset += 30 + fileName.length + data.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, directory.reduce((n, b) => n + b.length, 0), true);
  end.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...directory, new Uint8Array(end.buffer)]).arrayBuffer());
}

describe('unzipFile', () => {
  const files = { '[Content_Types].xml': '<Types/>', 'xl/worksheets/sheet1.xml': '<worksheet>Ignitis grupė</worksheet>' };

  it('inflates the one file asked for', async () => {
    expect(await unzipFile(await zipOf(files, true), 'xl/worksheets/sheet1.xml')).toBe('<worksheet>Ignitis grupė</worksheet>');
  });

  it('reads stored files', async () => {
    expect(await unzipFile(await zipOf(files, false), '[Content_Types].xml')).toBe('<Types/>');
  });

  it('finds nothing in a missing file or a page that is not a zip', async () => {
    expect(await unzipFile(await zipOf(files, true), 'xl/worksheets/sheet2.xml')).toBeNull();
    expect(await unzipFile(new TextEncoder().encode('<html>Request unsuccessful.</html>'), 'xl/worksheets/sheet1.xml')).toBeNull();
  });
});

describe('Nasdaq quote details', () => {
  const closedAt = { lastSalePrice: '$354.88', netChange: '-0.48', percentageChange: '-0.14%', lastTradeTimestamp: 'Closed at Nov 12, 2026 4:00 PM ET', isRealTime: false, volume: '' };

  it('keeps the regular close as the price and the pre-market trade apart', () => {
    const q = parseNasdaqInfo({
      primaryData: { lastSalePrice: '$355.8147', netChange: '+0.9347', percentageChange: '+0.26%', lastTradeTimestamp: 'Nov 13, 2026 6:34 AM ET', isRealTime: true, volume: '79,894.368768' },
      secondaryData: closedAt,
    });
    expect([q.price, q.change, q.changePct, q.time, q.closed]).toEqual([354.88, -0.48, -0.14, '2026-11-12T21:00:00.000Z', true]);
    expect(q.extended).toMatchObject({ session: 'pre', price: 355.8147, time: '2026-11-13T11:34:00.000Z' });
    expect(q.extended!.change).toBeCloseTo(0.9347);
    expect(q.extended!.changePct).toBeCloseTo(0.2634, 3);
  });

  it('calls trades after the close after-hours, and has none during the session', () => {
    const post = parseNasdaqInfo({
      primaryData: { lastSalePrice: '$355.00', lastTradeTimestamp: 'Nov 12, 2026 6:42 PM ET', isRealTime: true },
      secondaryData: closedAt,
    });
    expect(post.extended?.session).toBe('post');
    const open = parseNasdaqInfo({
      primaryData: { lastSalePrice: '$99.165', netChange: '+1.725', percentageChange: '+1.77%', lastTradeTimestamp: 'Nov 13, 2026 11:07 AM ET', isRealTime: true, volume: '4,604,203' },
      secondaryData: null,
    });
    expect([open.price, open.volume, open.closed, open.extended]).toEqual([99.165, 4604203, false, undefined]);
  });

  it('finds the daily bar of the quote\'s session only', () => {
    const bars = [{ t: Date.UTC(2026, 10, 12), o: 98.25, h: 98.38, l: 97.38, c: 97.44, v: 1 }];
    expect(sessionBar(bars, '2026-11-12T21:00:00.000Z')).toBe(bars[0]);
    expect(sessionBar(bars, '2026-11-13T16:07:00.000Z')).toBeNull();
    expect(sessionBar([], '2026-11-13T16:07:00.000Z')).toBeNull();
  });

  it('reads the next earnings date with its timing, and drops a past one', () => {
    const expected = { reportText: 'Broadcom Inc. Common Stock is expected* to report earnings on  12/09/2026 after market close.  The report will be for the fiscal Quarter ending Oct 2026.' };
    const estimated = { reportText: 'Oracle Corporation Common Stock is estimated to report earnings on  12/09/2026. The upcoming earnings date is derived from an algorithm.' };
    const unknown = { reportText: "Our vendor, Zacks Investment Research, hasn't provided us with the upcoming earnings report date." };
    expect(parseEarningsDate(expected, '2026-11-13')).toEqual({ day: '2026-12-09', estimated: false, timing: 'post' });
    expect(parseEarningsDate(estimated, '2026-11-13')).toEqual({ day: '2026-12-09', estimated: true, timing: null });
    expect(parseEarningsDate(unknown, '2026-11-13')).toBeNull();
    expect(parseEarningsDate(expected, '2026-12-10')).toBeNull();
  });

  it('reads the latest declared dividend while its dates are ahead', () => {
    const data = { dividends: { rows: [
      { exOrEffDate: '11/19/2026', amount: '$0.98', paymentDate: '12/10/2026' },
      { exOrEffDate: '08/20/2026', amount: '$0.91', paymentDate: '09/10/2026' },
    ] } };
    expect(parseNextDividend(data, '2026-11-13')).toEqual({ exDay: '2026-11-19', payDay: '2026-12-10', amount: 0.98 });
    expect(parseNextDividend(data, '2026-11-20')).toEqual({ exDay: null, payDay: '2026-12-10', amount: 0.98 });
    expect(parseNextDividend(data, '2026-12-11')).toBeNull();
    expect(parseNextDividend({ dividends: { rows: null } }, '2026-11-13')).toBeNull();
  });
});

describe('fund sources', () => {
  // The Robur list page embeds its rows as escaped JSON inside a Next.js script string.
  const roburRow = (over: Record<string, unknown>) => ({
    name: 'Swedbank Robur Access Edge Global C', isin: 'SE0015192349', currency: 'EUR', closePrice: 19.4277, closePriceDate: '2026-11-12',
    returnD1: -0.1, returnW1: 1.2, returnM1: -1.8, returnM3: 2.2, returnM6: 10.8, returnM0: 19, returnM12: 17.5, returnM36UA: 58.4,
    returnM60UA: null, ongoingCharge: 0.3, summaryRiskIndicator: 4, inceptionDate: '2020-09-15', customAttributes29: 'MSCI World Net',
    indexFund: true, globalAssetClassId: '$$BCG$EQUTY', ratingM36: 4, ...over,
  });
  const roburPage = (rows: unknown[]) => {
    const state = JSON.stringify({ total: rows.length, page: 1, rows });
    const escaped = JSON.stringify(`5:["$","$L18",null,{"state":{"queries":[{"state":{"data":${state},"dataUpdateCount":1}}]}}]`).slice(1, -1);
    return `<html><script>self.__next_f.push([1,"${escaped}"])</script></html>`;
  };

  it('reads Swedbank Robur share classes with NAV, returns, fees and risk, and skips broken rows', async () => {
    const { parseRoburList } = await import('../worker/providers/robur');
    const now = Date.parse('2026-11-14T10:00:00Z');
    const entries = parseRoburList(roburPage([
      roburRow({}),
      roburRow({ isin: 'SE0000000001', name: 'Bond A', globalAssetClassId: '$$BCG$FXINC', currency: 'SEK', returnD1: null }),
      roburRow({ isin: 'bad', name: 'Broken' }),
      roburRow({ isin: 'SE0000000019', closePrice: null }),
      roburRow({ isin: 'SE0000000027', closePriceDate: '2022-02-25' }),
    ]), now);
    expect(entries.map((e) => e.inst.symbol)).toEqual(['FUND:SE0015192349', 'FUND:SE0000000001']);
    const [edge, bond] = entries;
    expect(edge.inst).toMatchObject({ kind: 'fund', provider: 'robur', providerId: 'SE0015192349', company: 'Swedbank Robur', category: 'equity', currency: 'EUR' });
    expect(edge.facts).toMatchObject({ navDate: '2026-11-12', ongoingCharge: 0.3, risk: 4, benchmark: 'MSCI World Net', indexFund: true, history: false });
    expect(edge.facts.returns).toMatchObject({ '1W': 1.2, YTD: 19, '1Y': 17.5, '3Y': 58.4, '5Y': null });
    expect(edge.prevClose).toBeCloseTo(19.4277 / 0.999, 6);
    expect(bond.inst.category).toBe('bond');
    expect(bond.prevClose).toBeNull();
    expect(parseRoburList('<html>no list</html>')).toEqual([]);
  });

  it('reads the Estonian pension registry pages and NAV downloads', async () => {
    const { decodeUtf16, parseNavRows, parsePensionFundIds, pensionEntries } = await import('../worker/providers/pensionikeskus');
    const html = `<input type="checkbox" value="EPI"  name="f[]" id="EPI" /><label for="EPI">EPI-II index</label>
      <input type="checkbox" value="38"  name="f[]" id="fund_38" />
                <label for="fund_38">LHV Pensionifond Julge</label>
      <input type="checkbox" value="57" checked="checked" name="f[]" id="fund_57" /><label for="fund_57">Luminor 16-50 pension fund </label>`;
    const ids = parsePensionFundIds(html);
    expect(ids).toEqual([{ id: '38', name: 'LHV Pensionifond Julge' }, { id: '57', name: 'Luminor 16-50 pension fund' }]);

    const text = 'Date\tFund\tShortname\tISIN\tNAV\tChange %\r\n'
      + '2025-11-12\tLHV Pensionifond Julge\tLXK75\tEE3600019766\t2,39650\t0\r\n'
      + '2026-11-11\tLHV Pensionifond Julge\tLXK75\tEE3600019766\t2,60831\t0\r\n'
      + '2026-11-12\tLuminor 16-50 pension fund \tNPK75\tEE3600103503\t2,00872\t1.41\r\n'
      + '2026-11-12\tLHV Pensionifond Julge\tLXK75\tEE3600019766\t2,59189\t0.87\r\n';
    // The download is UTF-16 little-endian with a byte-order mark.
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + 2 * i] = text.charCodeAt(i);
    const rows = parseNavRows(decodeUtf16(bytes));
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual({ day: '2026-11-12', name: 'LHV Pensionifond Julge', isin: 'EE3600019766', nav: 2.59189 });

    const entries = pensionEntries('ii', ids, rows.slice(1), rows.slice(0, 1));
    expect(entries.map((e) => e.inst.symbol)).toEqual(['FUND:EE3600019766', 'FUND:EE3600103503']);
    expect(entries[0].inst).toMatchObject({ provider: 'pensionikeskus', providerId: 'ii:38', company: 'LHV', category: 'pension2', currency: 'EUR' });
    expect(entries[0]).toMatchObject({ price: 2.59189, prevClose: 2.60831 });
    expect(entries[0].facts.returns['1Y']).toBeCloseTo((2.59189 / 2.3965 - 1) * 100, 6);
    expect(entries[1]).toMatchObject({ price: 2.00872, prevClose: null });
    expect(entries[1].inst.company).toBe('Luminor');
  });

  it('quotes a fund NAV as end of day, never live', async () => {
    const { fundProvider } = await import('../worker/providers/funds');
    const inst = { symbol: 'FUND:EE3600019766', name: 'LHV Pensionifond Julge', kind: 'fund' as const, exchange: 'XTAL' as const, currency: 'EUR', region: 'BAL' as const, provider: 'pensionikeskus' as const, providerId: 'ii:38' };
    const facts = {
      isin: 'EE3600019766', company: 'LHV', category: 'pension2' as const, navDate: '2026-11-12', ongoingCharge: null, risk: null, inception: null,
      benchmark: null, indexFund: null, returns: { '1W': null, '1M': null, '3M': null, '6M': null, YTD: null, '1Y': null, '3Y': null, '5Y': null }, history: true, source: 'pensionikeskus' as const,
    };
    const provider = fundProvider(async () => [{ inst, facts, price: 2.5, prevClose: 2.4, time: '2026-11-12T16:00:00.000Z' }], async () => []);
    const quote = await provider.quote(inst, Promise.resolve([]));
    expect(quote).toMatchObject({ price: 2.5, freshness: 'eod', volume: null });
    expect(quote.changePct).toBeCloseTo((2.5 / 2.4 - 1) * 100, 6);
    expect(await provider.intraday(inst)).toBeNull();
    expect((await provider.details!(inst)).fund?.isin).toBe('EE3600019766');
    await expect(provider.quote({ ...inst, symbol: 'FUND:EE0000000000' }, Promise.resolve([]))).rejects.toThrow();
  });
});

describe('heatmap data parsers', () => {
  it('reads shares and the ICB supersector from a Nordic summary', () => {
    expect(parseNordicSummaryMeta(nokiaSummary)).toEqual({ shares: 5742239696, icb: '1510', segment: 'Large Cap' });
    expect(parseNordicSummaryMeta({ data: null })).toEqual({ shares: null, icb: null, segment: null });
  });

  it('reads admitted shares and the ICB supersector from Euronext factsheet blocks', () => {
    expect(parseAdmittedShares(euronextTradingInfo)).toBe(388147751);
    expect(parseIcbSupersector(euronextIcb)).toBe('1010');
    expect(parseAdmittedShares('')).toBeNull();
    expect(parseIcbSupersector('')).toBeNull();
  });

  it('reads each Baltic line\'s market value at the end of the period', () => {
    const caps = parseBalticCapitalization(balticCapitalization);
    expect(caps['LT0000128092']).toBe(295891751.37);
    expect(Object.keys(caps)).toHaveLength(3);
  });
});

describe('US live quotes for the heatmap', () => {
  const screenerRow = (ticker: string, cap: number) => ({
    symbol: ticker, name: `${ticker} Inc. Common Stock`, lastsale: '$10.00', netchange: '0.1', pctchange: '1%', volume: '100', marketCap: String(cap), sector: 'Technology', industry: '',
  });

  it('orders the catalogue first, then by market value', () => {
    const row = (id: string, marketCap: number | null) => ({ exchange: 'XNAS', id, row: { marketCap } }) as UsRow;
    expect(usLiveOrder([row('ZZZ', 5), row('AAPL', 1), row('YYY', null), row('XXX', 9)])).toEqual(['AAPL', 'XXX', 'ZZZ', 'YYY']);
  });

  it('quotes ranks 201 to 500, live, in watchlist calls of 20', async () => {
    const realFetch = globalThis.fetch;
    const asked: string[] = [];
    // Tickers are letters only: QAAA, QAAB, ...
    const ticker = (i: number) => `Q${[676, 26, 1].map((d) => String.fromCharCode(65 + (Math.floor(i / d) % 26))).join('')}`;
    const rows = Array.from({ length: 600 }, (_, i) => screenerRow(ticker(i), 1e12 - i * 1e9));
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/screener/')) {
        return new Response(JSON.stringify({ data: { rows: url.searchParams.get('exchange') === 'nasdaq' ? rows : [screenerRow('ZZZZ', 1)] } }));
      }
      const tickers = url.searchParams.getAll('symbol').map((s) => s.split('|')[0].toUpperCase());
      asked.push(...tickers);
      return new Response(JSON.stringify({ data: tickers.map((symbol) => ({
        symbol, lastSalePrice: '$11.00', netChange: '1.00', percentageChange: '10.00%', volume: '5', lastTradeTimestamp: 'Nov 13, 2026', lastTradeTimestampDateTime: '2026-11-13T00:00:00',
      })) }));
    };
    try {
      const { items, failed } = await usMoreQuotes();
      expect(failed).toEqual([]);
      expect(items).toHaveLength(300);
      expect(asked).toHaveLength(300);
      // The catalogue's US stocks are not in this screener, so rank 201 is the 201st largest.
      expect(items[0]).toMatchObject({ symbol: ticker(200), price: 11, changePct: 10, marketCap: 800e9, freshness: 'realtime', time: '2026-11-13T21:00:00.000Z' });
      expect(items[299].symbol).toBe(ticker(499));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
