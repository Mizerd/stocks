export type Region = 'US' | 'EU' | 'BAL';
// A group of exchanges whose prices come from one bulk source: the unit of /api/quotes and /api/universe.
export type Market = 'us' | 'nordic' | 'euronext' | 'baltic';
export type Sector = 'T' | 'C' | 'D' | 'S' | 'F' | 'E' | 'H' | 'U' | 'I' | 'M' | 'R';
export type ProviderId = 'nasdaq' | 'nordic' | 'euronext' | 'baltic';
export type ExchangeId =
  | 'XNAS' | 'XNYS' | 'XAMS' | 'XPAR' | 'XMIL' | 'XCSE' | 'XHEL' | 'XSTO' | 'XLIT' | 'XRIS' | 'XTAL';
export type Range = '1D' | '5D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

// How fresh a provider's quote is. Shown next to every price.
export type Freshness = 'realtime' | 'delayed' | 'eod';

export interface Instrument {
  symbol: string;
  name: string;
  kind: 'stock' | 'index';
  exchange: ExchangeId;
  currency: string;
  region: Region;
  sector?: Sector;
  provider: ProviderId;
  providerId: string;
  // Title of the company's English Wikipedia article.
  wiki?: string;
  // Where the provider identifier is not one (Nasdaq Nordic orderbook ids).
  isin?: string;
}

// What the browser needs to know about a covered stock: /api/universe returns these.
export type Listing = Omit<Instrument, 'providerId' | 'wiki' | 'isin'>;

// One row of /api/quotes: a stock's latest price from its market's bulk list.
export interface BulkQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  marketCap: number | null;
  time: string;
  freshness: Freshness;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  time: string;
  freshness: Freshness;
  marketCap: number | null;
  pe: number | null;
  eps: number | null;
  dividend: number | null;
  dividendYield: number | null;
  avgVolume: number | null;
}

export interface StockSummary extends Listing, Quote {
  high52: number | null;
  low52: number | null;
  return1Y: number | null;
  spark: number[];
}

export interface History {
  symbol: string;
  range: Range;
  interval: 'intraday' | 'day' | 'week';
  // Extra bars before the visible window, so indicators are valid from the first visible bar.
  warmup: number;
  candles: Candle[];
  prevClose: number | null;
  // 1D only: which session the bars belong to.
  session?: IntradaySession;
}

// Before today's first trade the 1D chart shows US pre-market trades or else the previous session.
export interface IntradaySession {
  kind: 'today' | 'premarket' | 'previous';
  // The session's date at its exchange, e.g. "2026-11-12".
  day: string;
}

export interface QuarterFigure {
  period: string;
  value: number;
  estimate?: number | null;
}

export interface StockDetail {
  summary: StockSummary;
  isin: string | null;
  industry: string | null;
  description: string | null;
  quarterlyEps: QuarterFigure[];
  quarterlyRevenue: QuarterFigure[];
  analysts: { buy: number; hold: number; sell: number; target: number | null } | null;
}

export interface CompanyAbout {
  extract: string;
  description: string | null;
  url: string;
  lang: 'lt' | 'en';
}

export interface NewsItem {
  title: string;
  link: string;
  time: string;
  issuer: string;
}

export interface FxRates {
  date: string;
  // Units of each currency per one euro (ECB reference rates).
  perEur: Record<string, number>;
}

export interface ProviderStatus {
  provider: ProviderId | 'ecb';
  ok: boolean;
  ms: number;
  error?: string;
}
