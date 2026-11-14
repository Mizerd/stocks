export type Region = 'US' | 'EU' | 'BAL';
// A group of exchanges whose prices come from one bulk source: the unit of /api/quotes and /api/universe.
export type Market = 'us' | 'nordic' | 'euronext' | 'baltic';
export type Sector = 'T' | 'C' | 'D' | 'S' | 'F' | 'E' | 'H' | 'U' | 'I' | 'M' | 'R';
export type ProviderId = 'nasdaq' | 'nordic' | 'euronext' | 'baltic' | 'robur' | 'pensionikeskus';
export type ExchangeId =
  | 'XNAS' | 'XNYS' | 'XAMS' | 'XPAR' | 'XMIL' | 'XCSE' | 'XHEL' | 'XSTO' | 'XLIT' | 'XRIS' | 'XTAL';
export type Range = '1D' | '5D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

// How fresh a provider's quote is. Shown next to every price. A fund's NAV is always 'eod'.
export type Freshness = 'realtime' | 'delayed' | 'eod';

// What a fund invests in; Estonian pension funds by pillar (II: mandatory, III: voluntary).
export type FundCategory = 'equity' | 'bond' | 'mixed' | 'pension2' | 'pension3';

export interface Instrument {
  symbol: string;
  name: string;
  kind: 'stock' | 'index' | 'fund';
  // A fund trades on no exchange: this is the home market whose time zone its NAV dates follow.
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
  // Funds only: the fund company and what the fund invests in.
  company?: string;
  category?: FundCategory;
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
  // US trades before the open or after the close, when there are any since the last regular close.
  extended?: ExtendedQuote;
}

export interface ExtendedQuote {
  session: 'pre' | 'post';
  price: number;
  // Against the regular session's close.
  change: number;
  changePct: number;
  time: string;
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
  // Funds only.
  fund?: FundFacts;
}

export type FundPeriod = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y';

// What a fund's source publishes about it besides the NAV. Missing figures are null.
export interface FundFacts {
  isin: string;
  company: string;
  category: FundCategory;
  // The day the NAV was struck, at the fund's home market ("2026-11-12").
  navDate: string;
  // Ongoing charges, percent a year.
  ongoingCharge: number | null;
  // Summary risk indicator (SRI), 1 to 7.
  risk: number | null;
  inception: string | null;
  benchmark: string | null;
  indexFund: boolean | null;
  // Cumulative returns in percent, not annualised.
  returns: Record<FundPeriod, number | null>;
  // False where the source publishes today's NAV only, so there is no chart.
  history: boolean;
  source: 'robur' | 'pensionikeskus';
}

// One row of /api/funds: a fund with its latest NAV.
export interface FundRow extends Listing {
  isin: string;
  navDate: string;
  price: number;
  change: number | null;
  changePct: number | null;
  time: string;
  ongoingCharge: number | null;
  risk: number | null;
  return1Y: number | null;
  // False where the source publishes the latest NAV only.
  history: boolean;
}

// Dates still to come, as calendar days at the exchange ("2026-12-09").
export interface Upcoming {
  earnings: { day: string; estimated: boolean; timing: 'pre' | 'post' | null } | null;
  dividend: { exDay: string | null; payDay: string | null; amount: number | null } | null;
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
