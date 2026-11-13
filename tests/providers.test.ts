import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { num } from '../worker/http';
import { STOCKS } from '../shared/catalog';
import { baltic, parseBalticShareList, parseBalticXlsx } from '../worker/providers/baltic';
import { parseEcbRates } from '../worker/providers/ecb';
import { liveQuote, parseEuronextCsv, parseEuronextList } from '../worker/providers/euronext';
import { bucket, companyName, parseNasdaqRows, parseNasdaqTime, parseUsScreener, parseWatchlist } from '../worker/providers/nasdaq';
import { parseNewsFeed } from '../worker/providers/news';
import { parseNordicChart, parseNordicScreener } from '../worker/providers/nordic';
import { parseLangLink, parseSitelinks, parseSummary, wikidataQuery } from '../worker/providers/wikipedia';

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
    expect([...rows.keys()]).toEqual(['NL0010273215-XAMS']);
    // 14:11 in Amsterdam in November is 13:11 UTC.
    expect(rows.get('NL0010273215-XAMS')).toEqual({ price: 1402.2, changePct: 3.03, time: '2026-11-11T13:11:00.000Z' });
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
    expect(list.rows.get('LT0000115768')).toEqual({
      isin: 'LT0000115768', ticker: 'IGN1L', name: 'Ignitis', industry: 'Utilities', home: 'VLN',
      last: 21.45, change: -0.05, changePct: -0.23, volume: 16933, prevClose: 21.5,
    });
    // No trade today: the last price stays, the change is unknown.
    expect(list.rows.get('LT0000111676')).toMatchObject({ name: 'Pieno & žvaigždės', last: 2.1, change: null, volume: 0 });
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
