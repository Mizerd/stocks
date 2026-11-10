import type { Candle, Instrument, Quote, StockDetail } from '../../shared/types';

export interface Intraday {
  candles: Candle[];
  prevClose: number | null;
}

export type DetailExtras = Omit<StockDetail, 'summary'>;

// Every market-data source implements this. Daily candles come back oldest first.
export interface Provider {
  // `daily` is the instrument's recent history, for sources whose quote is derived from it.
  quote(inst: Instrument, daily: Candle[]): Promise<Quote>;
  daily(inst: Instrument, years: number): Promise<Candle[]>;
  // null when the source publishes no intraday prices.
  intraday(inst: Instrument): Promise<Intraday | null>;
  details?(inst: Instrument): Promise<DetailExtras>;
}

export const NO_EXTRAS: DetailExtras = {
  isin: null, industry: null, description: null, quarterlyEps: [], quarterlyRevenue: [], analysts: null,
};

export function emptyFundamentals() {
  return { marketCap: null, pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null };
}
