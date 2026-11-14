import type { Candle, FundFacts, Instrument, Quote } from '../../shared/types';
import { UpstreamError } from '../http';
import { emptyFundamentals, NO_EXTRAS, type DetailExtras, type Provider } from './provider';

// A fund of a fund source's list, with its latest NAV. Plain JSON, so lists can sit in the edge cache.
export interface FundEntry {
  inst: Instrument;
  facts: FundFacts;
  price: number;
  // The NAV before the latest one, where the source gives it.
  prevClose: number | null;
  // When the latest NAV was struck.
  time: string;
}

// The Provider of a fund source: quotes and details come from its list; `navs` loads one fund's daily NAVs.
export function fundProvider(list: () => Promise<FundEntry[]>, navs: (inst: Instrument, years: number) => Promise<Candle[]>): Provider {
  const entry = async (inst: Instrument) => {
    const found = (await list()).find((e) => e.inst.symbol === inst.symbol);
    if (!found) throw new UpstreamError(`No NAV for ${inst.symbol}`);
    return found;
  };
  return {
    async quote(inst): Promise<Quote> {
      const { price, prevClose, time } = await entry(inst);
      const change = prevClose === null ? 0 : price - prevClose;
      return {
        price, change, changePct: prevClose ? (change / prevClose) * 100 : 0, prevClose: prevClose ?? price,
        open: null, high: null, low: null, volume: null, time, freshness: 'eod', ...emptyFundamentals(),
      };
    },
    daily: navs,
    intraday: async () => null,
    // Where the source publishes a history, market.ts replaces the returns with ones measured on it.
    async details(inst): Promise<DetailExtras> {
      const { facts } = await entry(inst);
      return { ...NO_EXTRAS, isin: facts.isin, fund: facts };
    },
  };
}

// Funds load their whole five-year history at once; every chart range and return reads the same series.
export const FUND_YEARS = 5.2;
