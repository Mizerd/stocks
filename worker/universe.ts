import { findInstrument, isFundSymbol, isSymbolShaped, STOCKS } from '../shared/catalog';
import { EXCHANGES, lastSessionTime, latestSession, MARKET_EXCHANGES } from '../shared/exchanges';
import type { BulkQuote, ExchangeId, Instrument, Market, Sector } from '../shared/types';
import { findFund } from './funds';
import { memo, shared } from './http';
import { summary } from './market';
import { balticShareList, quoteTime } from './providers/baltic';
import { euronextList, LIST_MICS, liveQuote } from './providers/euronext';
import { usScreener, usWatchlist, type ScreenerRow, type WatchlistRow } from './providers/nasdaq';
import { nordicScreener, type NordicMarket } from './providers/nordic';

// Every covered stock of a market with its latest price from the market's bulk list.
export interface Listed {
  inst: Instrument;
  quote: BulkQuote | null;
}

interface Source {
  id: string;
  market: Market;
  // Symbol endings this source covers; '' is a bare US ticker.
  suffixes: string[];
  load(): Promise<Listed[]>;
  // The instruments alone, where they come cheaper than with prices.
  instruments?(): Promise<Instrument[]>;
}

// The sources' own sector names (Nasdaq US, Nasdaq Nordic and Nasdaq Baltic use the same words).
const SECTORS: Record<string, Sector> = {
  Technology: 'T', Telecommunications: 'C', 'Consumer Discretionary': 'D', 'Consumer Staples': 'S',
  Finance: 'F', Financials: 'F', Energy: 'E', 'Health Care': 'H', Utilities: 'U', Industrials: 'I',
  'Basic Materials': 'M', 'Real Estate': 'R',
};

// Nasdaq US files pipelines, waste collectors and network-equipment makers under Utilities.
const US_INDUSTRIES: Record<string, Sector> = {
  'Oil/Gas Transmission': 'E', 'Oil & Gas Production': 'E', 'Environmental Services': 'I', 'Telecommunications Equipment': 'C',
};

// Pipeline operators share the "Natural Gas Distribution" label with real gas utilities, so they are named here.
const US_MIDSTREAM = new Set(['DINO', 'DTM', 'ENB', 'EPD', 'ET', 'KMI', 'MPLX', 'OKE', 'PAA', 'TRGP', 'TRP', 'WES', 'WMB']);

export const toSector = (name: string, industry = '', ticker = ''): Sector | undefined =>
  US_MIDSTREAM.has(ticker) ? 'E' : US_INDUSTRIES[industry] ?? SECTORS[name.trim()];

// "NOVO B" -> "NOVO-B", "BRK/B" -> "BRK-B": a dot would read as an exchange suffix.
export const tickerSymbol = (ticker: string, suffix: string) => ticker.trim().replace(/[\s/.]+/g, '-') + suffix;

const curated = new Map(STOCKS.map((inst) => [`${inst.provider}:${inst.providerId}`, inst]));

// A hand-checked catalogue entry wins over what the bulk list says about the same share.
const known = (inst: Instrument) => curated.get(`${inst.provider}:${inst.providerId}`) ?? inst;

function listed(inst: Instrument, quote: Omit<BulkQuote, 'symbol'> | null): Listed {
  const entry = known(inst);
  return { inst: entry, quote: quote && { symbol: entry.symbol, ...quote } };
}

// The screener lists a session's closing prices, but publishes them some time after the close.
// A share quoted both ways shows which session the list holds: if its listed price is the live
// quote's previous close, the list is a session behind the live quote.
function screenerClose(listed: ScreenerRow | undefined, live: WatchlistRow | undefined): string {
  const nyse = EXCHANGES.XNYS;
  const now = new Date();
  // Without a live quote to compare with: during a session the list still holds the one before it.
  if (!listed || !live) {
    const session = latestSession(nyse, now);
    return (session.closes > now ? lastSessionTime(nyse, new Date(session.opens.getTime() - 60000)) : session.closes).toISOString();
  }
  const behind = Math.abs(listed.price - (live.price - live.change)) < 1e-6;
  if (!behind) return live.time;
  const liveSession = latestSession(nyse, new Date(live.time));
  return lastSessionTime(nyse, new Date(liveSession.opens.getTime() - 60000)).toISOString();
}

// Live quotes for this many US shares, the catalogue's and then the largest: 20 per call.
const US_LIVE = 200;
// The heatmap asks for the next ones apart, only while it shows the US.
const US_HEATMAP = 500;

export interface UsRow {
  exchange: ExchangeId;
  row: ScreenerRow;
  id: string;
}

async function usRows(): Promise<UsRow[]> {
  const lists = await Promise.all((['XNAS', 'XNYS'] as const).map(async (exchange) => ({ exchange, rows: await usScreener(exchange) })));
  return lists.flatMap(({ exchange, rows }) => rows.map((row) => ({ exchange, row, id: row.ticker.replace('/', '.') })));
}

const usInstrument = ({ exchange, row, id }: UsRow): Instrument => ({
  symbol: tickerSymbol(row.ticker, ''), name: row.name, kind: 'stock', exchange, currency: 'USD', region: 'US',
  sector: toSector(row.sector, row.industry, row.ticker), provider: 'nasdaq', providerId: id,
});

const nasdaqCatalogue = new Set(STOCKS.filter((s) => s.provider === 'nasdaq').map((s) => s.providerId));

// Which US shares get live quotes first: the catalogue's, then the largest.
export function usLiveOrder(rows: UsRow[]): string[] {
  return rows
    .map(({ id, row }) => ({ id, listed: Number(nasdaqCatalogue.has(id)), cap: row.marketCap ?? 0 }))
    .sort((a, b) => b.listed - a.listed || b.cap - a.cap)
    .map((r) => r.id);
}

const usLiveQuote = (r: UsRow, quote: WatchlistRow): Omit<BulkQuote, 'symbol'> => ({
  price: quote.price, change: quote.change, changePct: quote.changePct, volume: quote.volume, marketCap: r.row.marketCap, time: quote.time, freshness: 'realtime',
});

// Live quotes for the US shares ranked after the ones /api/quotes covers, up to the heatmap's 500.
export function usMoreQuotes(): Promise<{ items: BulkQuote[]; failed: string[] }> {
  return memo('source:US:2', 60, async () => {
    const rows = await usRows();
    const byId = new Map(rows.map((r) => [r.id, r]));
    try {
      const live = await usWatchlist(usLiveOrder(rows).slice(US_LIVE, US_HEATMAP));
      const items = live.flatMap((quote) => {
        const r = byId.get(quote.ticker);
        return r ? [{ symbol: known(usInstrument(r)).symbol, ...usLiveQuote(r, quote) }] : [];
      });
      return { items, failed: [] };
    } catch {
      return { items: [], failed: ['US'] };
    }
  });
}

const usSource: Source = {
  id: 'US',
  market: 'us',
  suffixes: [''],
  // Symbol lookups need the screener lists only, not the live quotes.
  async instruments() {
    return (await usRows()).map((r) => known(usInstrument(r)));
  },
  async load() {
    const rows = await usRows();
    const live = new Map((await usWatchlist(usLiveOrder(rows).slice(0, US_LIVE)).catch(() => [])).map((w) => [w.ticker, w]));
    const reference = rows.find((r) => live.get(r.id)?.change);
    const closeTime = screenerClose(reference?.row, reference && live.get(reference.id));
    return rows.map((r) => {
      const { row } = r;
      const quote = live.get(r.id);
      return listed(
        usInstrument(r),
        quote
          ? usLiveQuote(r, quote)
          : { price: row.price, change: row.change, changePct: row.changePct, volume: row.volume, marketCap: row.marketCap, time: closeTime, freshness: 'eod' },
      );
    });
  },
};

const NORDIC: Record<NordicMarket, { exchange: ExchangeId; suffix: string }> = {
  HEL: { exchange: 'XHEL', suffix: '.HE' },
  CPH: { exchange: 'XCSE', suffix: '.CO' },
  STO: { exchange: 'XSTO', suffix: '.ST' },
};

function nordicSource(market: NordicMarket): Source {
  const { exchange, suffix } = NORDIC[market];
  return {
    id: market,
    market: 'nordic',
    suffixes: [suffix],
    async load() {
      const { fetched, rows } = await nordicScreener(market);
      const time = lastSessionTime(EXCHANGES[exchange], new Date(fetched)).toISOString();
      return rows.map((r) =>
        listed(
          {
            symbol: tickerSymbol(r.ticker, suffix), name: r.name, kind: 'stock', exchange, currency: r.currency, region: 'EU',
            sector: toSector(r.sector), provider: 'nordic', providerId: r.orderbookId, isin: r.isin,
          },
          r.price === null
            ? null
            : { price: r.price, change: r.change ?? 0, changePct: r.changePct ?? 0, volume: r.volume, marketCap: null, time, freshness: 'delayed' },
        ),
      );
    },
  };
}

const BALTIC: Record<string, { exchange: ExchangeId; suffix: string }> = {
  VLN: { exchange: 'XLIT', suffix: '.VS' },
  RIG: { exchange: 'XRIS', suffix: '.RG' },
  TLN: { exchange: 'XTAL', suffix: '.TL' },
};

const balticSource: Source = {
  id: 'baltic',
  market: 'baltic',
  suffixes: ['.VS', '.RG', '.TL'],
  async load() {
    const list = await balticShareList();
    const times = new Map(Object.values(BALTIC).map(({ exchange }) => [exchange, quoteTime(list.asOf, EXCHANGES[exchange])]));
    return Object.values(list.rows).flatMap((r) => {
      const home = BALTIC[r.home];
      if (!home) return [];
      // A share without a trade today still shows its last price, with no change; volume 0 tells it from one
      // that traded unchanged.
      const quote = r.last === null ? null : {
        price: r.last, change: r.change ?? 0, changePct: r.changePct ?? 0, volume: r.volume || 0, marketCap: null,
        time: times.get(home.exchange)!, freshness: 'delayed' as const,
      };
      return [listed(
        {
          symbol: tickerSymbol(r.ticker, home.suffix), name: r.name, kind: 'stock', exchange: home.exchange, currency: 'EUR',
          region: 'BAL', sector: toSector(r.industry), provider: 'baltic', providerId: r.isin,
        },
        quote,
      )];
    });
  },
};

// Euronext's bulk list has no sectors, so only catalogue stocks are covered; it supplies their prices.
const euronextStocks = STOCKS.filter((s) => s.provider === 'euronext');

const euronextSource: Source = {
  id: 'euronext',
  market: 'euronext',
  suffixes: [],
  async load() {
    const mic = (inst: Instrument) => inst.providerId.split('-')[1];
    // Lines outside the live lists (SAP's EuroTLX line) are quoted from their end-of-day file, fetched alongside.
    const endOfDay = new Map(euronextStocks.filter((inst) => !LIST_MICS.includes(mic(inst))).map((inst) => [inst.symbol, summary(inst).catch(() => null)]));
    const lists = new Map(await Promise.all(LIST_MICS.map(async (id) => [id, await euronextList(id).catch(() => null)] as const)));
    if ([...lists.values()].every((list) => list === null)) throw new Error('Euronext lists are unavailable');
    return Promise.all(
      euronextStocks.map(async (inst): Promise<Listed> => {
        if (lists.has(mic(inst))) {
          const row = lists.get(mic(inst))?.[inst.providerId];
          return listed(inst, row ? { ...liveQuote(row), volume: null, marketCap: null, time: row.time, freshness: 'delayed' } : null);
        }
        const s = await endOfDay.get(inst.symbol)!;
        return listed(inst, s && { price: s.price, change: s.change, changePct: s.changePct, volume: s.volume, marketCap: null, time: s.time, freshness: s.freshness });
      }),
    );
  },
};

const SOURCES: Source[] = [
  usSource,
  nordicSource('HEL'), nordicSource('CPH'), nordicSource('STO'), euronextSource,
  balticSource,
];

interface MarketData {
  items: Listed[];
  // Sources that could not be loaded.
  failed: string[];
}

// Parsed once a minute per isolate: the quotes endpoint and symbol lookups share it.
const loadSource = (source: Source) => memo(`source:${source.id}`, 60, () => source.load());

export async function marketData(market: Market): Promise<MarketData> {
  const sources = SOURCES.filter((s) => s.market === market);
  const results = await Promise.allSettled(sources.map(loadSource));
  const seen = new Set<string>();
  const items: Listed[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      // A share listed twice (two lines, or a clash of tickers) keeps its first entry.
      if (seen.has(item.inst.symbol)) continue;
      seen.add(item.inst.symbol);
      items.push(item);
    }
  }
  // Catalogue stocks stay covered while their source is down.
  for (const inst of STOCKS) {
    if (MARKET_EXCHANGES[market].includes(inst.exchange) && !seen.has(inst.symbol)) items.push({ inst, quote: null });
  }
  return { items, failed: sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id) };
}

const suffixOf = (symbol: string) => symbol.match(/\.[A-Z]{2}$/)?.[0] ?? '';

// Which shares a source lists changes rarely, so symbol lookups keep the list for an hour per data centre,
// and for a week as a stale copy served while a new one loads, instead of reading the minute-fresh bulk lists.
const instrumentsOf = (source: Source) =>
  shared(`instruments:${source.id}`, 3600, async () => source.instruments?.() ?? (await loadSource(source)).map((item) => item.inst), 7 * 24 * 3600);

// A catalogue stock, one in its market's bulk list, or a fund on a fund list. Only listed symbols ever reach a provider.
export async function resolveSymbol(input: string): Promise<Instrument | undefined> {
  const symbol = input.trim().toUpperCase();
  if (isFundSymbol(symbol)) return (await findFund(symbol))?.inst;
  const known = findInstrument(input);
  if (known) return known;
  if (!isSymbolShaped(symbol)) return undefined;
  for (const source of SOURCES.filter((s) => s.suffixes.includes(suffixOf(symbol)))) {
    const match = (await instrumentsOf(source).catch(() => [])).find((inst) => inst.symbol === symbol);
    if (match) return match;
  }
  return undefined;
}
