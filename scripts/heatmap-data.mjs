// Gathers the heatmap's slow-changing data into public/data/heatmap.json: each stock's industry,
// its share count (outside the US) and which lines repeat a company already shown.
// Run by hand about monthly (npm run heatmap:data) and commit the result; builds never call upstream sites.
//
// Foreign companies listed on a Nordic exchange (AZN, ABB) carry the whole company's share count,
// so their tile shows the whole company valued at that line's price.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runnerImport } from 'vite';

const OUT = 'public/data/heatmap.json';
const IDS = 'scripts/heatmap/ids.json';

const load = async (path) => (await runnerImport(path)).module;
const [universe, nasdaq, nordic, euronext, baltic, catalog, icb, exchanges, { brand }] = await Promise.all([
  load('./worker/universe.ts'), load('./worker/providers/nasdaq.ts'), load('./worker/providers/nordic.ts'),
  load('./worker/providers/euronext.ts'), load('./worker/providers/baltic.ts'), load('./shared/catalog.ts'),
  load('./shared/icb.ts'), load('./shared/exchanges.ts'), load('./src/config/brand.ts'),
]);
const labels = JSON.parse(await readFile('src/i18n/en/heatmap.json', 'utf8')).icb;
const { tickerSymbol, toSector } = universe;
const { SECTOR_ICB, BALTIC_SUPERSECTOR_ICB, usIndustryKey } = icb;

const USER_AGENT = `stocks-viewer/1.0 (+${brand.siteUrl.replace(/^https?:\/\//, '')})`;
const today = new Date().toISOString().slice(0, 10);

async function get(url, accept = 'application/json') {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt > 0) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Runs `work` on every item, six at a time; a failed item gives null.
async function each(items, work) {
  const results = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]).catch((err) => (console.warn(`  ${err.message}`), null));
    }
  }));
  return results;
}

// A known ICB key with a label, or the site sector's "other" group.
const industryKey = (code, sector) => (code && labels[code] ? code : sector ? SECTOR_ICB[sector] : undefined);
const catalogue = (provider, id) => catalog.STOCKS.find((s) => s.provider === provider && s.providerId === id);

async function us() {
  const lists = await Promise.all(['nasdaq', 'nyse'].map(async (market) => {
    const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true&limit=5000&marketcap=mega|large&exchange=${market}`;
    return nasdaq.parseUsScreener(JSON.parse(await get(url))).map((row) => ({ row, exchange: market === 'nasdaq' ? 'XNAS' : 'XNYS' }));
  }));
  const stocks = {};
  const ids = {};
  const byCompany = new Map();
  for (const { row, exchange } of lists.flat()) {
    const symbol = catalogue('nasdaq', row.ticker.replace('/', '.'))?.symbol ?? tickerSymbol(row.ticker, '');
    const industry = usIndustryKey(row.industry, symbol, toSector(row.sector, row.industry, row.ticker));
    if (!industry) continue;
    stocks[symbol] = { industry };
    ids[symbol] = { ticker: row.ticker.replace('/', '.'), exchange };
    byCompany.set(row.name, [...(byCompany.get(row.name) ?? []), { symbol, volume: row.volume ?? 0 }]);
  }
  // Nasdaq gives each share class the whole company's market value: only the most traded class is sized.
  for (const lines of byCompany.values()) {
    lines.sort((a, b) => b.volume - a.volume).slice(1).forEach(({ symbol }) => (stocks[symbol].secondary = true));
  }
  return { stocks, ids };
}

const NORDIC = { HEL: { suffix: '.HE', exchange: 'XHEL', country: 'FI' }, CPH: { suffix: '.CO', exchange: 'XCSE', country: 'DK' }, STO: { suffix: '.ST', exchange: 'XSTO', country: 'SE' } };

async function nordicData() {
  const rows = (await Promise.all(Object.keys(NORDIC).map(async (market) => {
    const json = JSON.parse(await get(`https://api.nasdaq.com/api/nordic/screener/shares?category=MAIN_MARKET&tableonly=true&market=${market}`));
    return nordic.parseNordicScreener(json).map((row) => ({ row, market }));
  }))).flat();
  const summaries = await each(rows, async ({ row }) =>
    nordic.parseNordicSummaryMeta(JSON.parse(await get(`https://api.nasdaq.com/api/nordic/instruments/${row.orderbookId}/summary?assetClass=SHARES&lang=en`))));
  const stocks = {};
  const ids = {};
  const byIsin = new Map();
  rows.forEach(({ row, market }, i) => {
    const meta = summaries[i];
    const { suffix, exchange, country } = NORDIC[market];
    const symbol = catalogue('nordic', row.orderbookId)?.symbol ?? tickerSymbol(row.ticker, suffix);
    const industry = industryKey(meta?.icb, toSector(row.sector));
    if (!industry) return;
    stocks[symbol] = { industry, ...(meta?.shares ? { shares: meta.shares } : {}) };
    ids[symbol] = { isin: row.isin, ticker: row.ticker, exchange };
    const home = row.isin.startsWith(country);
    byIsin.set(row.isin, [...(byIsin.get(row.isin) ?? []), { symbol, home, turnover: (row.volume ?? 0) * (row.price ?? 0) }]);
  });
  // A company listed on several Nordic exchanges is shown once: on its home market, or else where it trades most.
  for (const lines of byIsin.values()) {
    lines.sort((a, b) => Number(b.home) - Number(a.home) || b.turnover - a.turnover).slice(1).forEach(({ symbol }) => (stocks[symbol].secondary = true));
  }
  return { stocks, ids, counted: summaries.filter(Boolean).length };
}

async function euronextData() {
  const lines = catalog.STOCKS.filter((s) => s.provider === 'euronext');
  const base = 'https://live.euronext.com/en/ajax/getFactsheetInfoBlock/STOCK';
  const facts = await each(lines, async (inst) => {
    const [trading, icbBlock] = await Promise.all([
      get(`${base}/${inst.providerId}/fs_tradinginfo_block`, 'text/html'),
      get(`${base}/${inst.providerId}/fs_icb_block`, 'text/html'),
    ]);
    return { shares: euronext.parseAdmittedShares(trading), icb: euronext.parseIcbSupersector(icbBlock) };
  });
  const stocks = {};
  const ids = {};
  lines.forEach((inst, i) => {
    stocks[inst.symbol] = { industry: industryKey(facts[i]?.icb, inst.sector), ...(facts[i]?.shares ? { shares: facts[i].shares } : {}) };
    ids[inst.symbol] = { isin: inst.providerId.split('-')[0], ticker: inst.symbol.split('.')[0], exchange: inst.exchange };
  });
  return { stocks, ids, counted: facts.filter((f) => f?.shares).length };
}

const BALTIC = { VLN: { suffix: '.VS', exchange: 'XLIT' }, RIG: { suffix: '.RG', exchange: 'XRIS' }, TLN: { suffix: '.TL', exchange: 'XTAL' } };

async function balticData() {
  // The latest session that has closed, so the price and the market value are from the same moment.
  const vilnius = exchanges.EXCHANGES.XLIT;
  const now = new Date();
  let session = exchanges.latestSession(vilnius, now);
  if (session.closes > now) session = exchanges.latestSession(vilnius, new Date(session.opens.getTime() - 60000));
  const day = exchanges.zonedParts(session.opens, 'Europe/Vilnius').day;
  const base = 'https://nasdaqbaltic.com/statistics/en';
  const [list, caps] = await Promise.all([
    get(`${base}/shares?date=${day}`, 'text/html').then(baltic.parseBalticShareList),
    get(`${base}/capitalization?filter=1&start=${day}&end=${day}`, 'text/html').then(baltic.parseBalticCapitalization),
  ]);
  const stocks = {};
  const ids = {};
  for (const row of Object.values(list.rows)) {
    const home = BALTIC[row.home];
    if (!home) continue;
    const symbol = catalogue('baltic', row.isin)?.symbol ?? tickerSymbol(row.ticker, home.suffix);
    const industry = industryKey(BALTIC_SUPERSECTOR_ICB[row.supersector.trim()], toSector(row.industry));
    if (!industry) continue;
    const shares = caps[row.isin] && row.last ? Math.round(caps[row.isin] / row.last) : null;
    stocks[symbol] = { industry, ...(shares ? { shares } : {}) };
    ids[symbol] = { isin: row.isin, ticker: row.ticker, exchange: home.exchange };
  }
  return { stocks, ids, day };
}

const SOURCES = {
  us: { run: us, owns: (symbol) => !symbol.includes('.') },
  nordic: { run: nordicData, owns: (symbol) => /\.(HE|CO|ST)$/.test(symbol) },
  euronext: { run: euronextData, owns: (symbol) => catalog.STOCKS.some((s) => s.symbol === symbol && s.provider === 'euronext') },
  baltic: { run: balticData, owns: (symbol) => /\.(VS|RG|TL)$/.test(symbol) },
};

const previous = await readFile(OUT, 'utf8').then(JSON.parse, () => null);
const oldIds = await readFile(IDS, 'utf8').then(JSON.parse, () => ({}));
const stocks = {};
const ids = {};
const sharesAsOf = { ...previous?.sharesAsOf };
let read = 0;

for (const [name, source] of Object.entries(SOURCES)) {
  const started = Date.now();
  const before = Object.keys(previous?.stocks ?? {}).filter(source.owns);
  const keepOld = () => before.forEach((symbol) => {
    stocks[symbol] = previous.stocks[symbol];
    if (oldIds[symbol]) ids[symbol] = oldIds[symbol];
  });
  let result;
  try {
    result = await source.run();
  } catch (err) {
    console.warn(`${name}: failed (${err.message}); keeping ${before.length} earlier entries`);
    keepOld();
    continue;
  }
  const found = Object.keys(result.stocks).length;
  // A partial answer must not shrink the file: keep the earlier entries instead.
  if (found < 0.9 * before.length) {
    console.warn(`${name}: only ${found} entries against ${before.length} before; keeping the earlier ones`);
    keepOld();
    continue;
  }
  read++;
  for (const [symbol, entry] of Object.entries(result.stocks)) {
    const logo = previous?.stocks[symbol]?.logo;
    stocks[symbol] = logo ? { ...entry, logo } : entry;
  }
  Object.assign(ids, result.ids);
  if (name !== 'us') sharesAsOf[name] = result.day ?? today;
  const sized = Object.values(result.stocks).filter((s) => s.shares).length;
  const secondary = Object.values(result.stocks).filter((s) => s.secondary).length;
  console.log(`${name}: ${found} stocks, ${sized} with shares, ${secondary} secondary${result.counted !== undefined ? `, ${result.counted} detail pages read` : ''} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

if (read === 0) {
  console.error('No source could be read; nothing written.');
  process.exit(1);
}

// One stock per line, sorted, so a re-run gives a small diff.
const lines = (record) => Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`).join(',\n');
const sorted = (record) => Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
await mkdir('public/data', { recursive: true });
await mkdir('scripts/heatmap', { recursive: true });
await writeFile(OUT, `{"built":"${today}","sharesAsOf":${JSON.stringify(sorted(sharesAsOf))},"stocks":{\n${lines(stocks)}\n}}\n`);
await writeFile(IDS, `{\n${lines(ids)}\n}\n`);
console.log(`Wrote ${OUT}: ${Object.keys(stocks).length} stocks.`);
