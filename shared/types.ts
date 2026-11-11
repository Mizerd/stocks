export type Region = 'US' | 'EU' | 'BAL';
export type Sector = 'T' | 'C' | 'D' | 'S' | 'F' | 'E' | 'H' | 'U' | 'I' | 'M';
export type ProviderId = 'nasdaq' | 'nordic' | 'euronext' | 'baltic';
export type ExchangeId = 'XNAS' | 'XNYS' | 'XAMS' | 'XPAR' | 'XMIL' | 'XCSE' | 'XHEL' | 'XLIT' | 'XTAL';
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

export interface StockSummary extends Instrument, Quote {
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
