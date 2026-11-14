import type { Candle, Instrument, Quote, StockDetail, Upcoming } from '../../shared/types';

export interface Intraday {
  // The regular session.
  candles: Candle[];
  prevClose: number | null;
  // US trades before the regular session opens.
  premarket?: Candle[];
}

export type DetailExtras = Omit<StockDetail, 'summary'>;

// Every market-data source implements this. Daily candles come back oldest first.
export interface Provider {
  // `daily` is the instrument's recent history, still loading, for sources whose quote is derived from it.
  quote(inst: Instrument, daily: Promise<Candle[]>): Promise<Quote>;
  daily(inst: Instrument, years: number): Promise<Candle[]>;
  // null when the source publishes no intraday prices.
  intraday(inst: Instrument): Promise<Intraday | null>;
  // For sources that keep the intraday prices of past days.
  pastIntraday?(inst: Instrument, day: string): Promise<Intraday | null>;
  details?(inst: Instrument): Promise<DetailExtras>;
  upcoming?(inst: Instrument): Promise<Upcoming>;
}

export const NO_EXTRAS: DetailExtras = {
  isin: null, industry: null, description: null, quarterlyEps: [], quarterlyRevenue: [], analysts: null,
};

export const NO_UPCOMING: Upcoming = { earnings: null, dividend: null };

export function emptyFundamentals() {
  return { marketCap: null, pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null };
}
