import type { Candle, Quote } from '../../shared/types';
import { EXCHANGES, zonedTime } from '../../shared/exchanges';
import { cachedText, daysAgo, isoDay, UpstreamError } from '../http';
import { emptyFundamentals, NO_EXTRAS, type DetailExtras, type Provider } from './provider';

const BASE = 'https://live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax';

// Euronext's "download historical data" CSV: four header lines, then
// Date;Open;High;Low;Last;Close;Number of Shares;... with the newest day first.
export function parseEuronextCsv(csv: string): Candle[] {
  const candles: Candle[] = [];
  for (const line of csv.split('\n')) {
    const cols = line.trim().split(';');
    const date = cols[0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!date) continue;
    const [o, h, l, , c, v] = cols.slice(1).map(Number);
    if (!(c > 0)) continue;
    candles.push({
      t: Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1])),
      o: o || c,
      h: h || c,
      l: l || c,
      c,
      v: v > 0 ? v : null,
    });
  }
  return candles.reverse();
}

export const euronext: Provider = {
  // Euronext only publishes end-of-day files keylessly, so the quote is the last close.
  async quote(inst, daily) {
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2];
    if (!last || !prev) throw new UpstreamError(`Euronext returned no prices for ${inst.symbol}`);
    const ex = EXCHANGES[inst.exchange];
    const quote: Quote = {
      price: last.c,
      change: last.c - prev.c,
      changePct: ((last.c - prev.c) / prev.c) * 100,
      prevClose: prev.c,
      open: last.o,
      high: last.h,
      low: last.l,
      volume: last.v,
      time: zonedTime(isoDay(new Date(last.t)), ex.close, ex.timezone).toISOString(),
      freshness: 'eod',
      ...emptyFundamentals(),
    };
    return quote;
  },

  // The download goes back about two years at most.
  async daily(inst, years) {
    const from = isoDay(daysAgo(Math.round(years * 365.25)));
    const url = `${BASE}/${inst.providerId}?format=csv&decimal_separator=.&date_form=d/m/Y&adjusted=Y&startdate=${from}&enddate=${isoDay(new Date())}`;
    return parseEuronextCsv(await cachedText(url, 900, 'text/csv'));
  },

  async intraday() {
    return null;
  },

  async details(inst): Promise<DetailExtras> {
    return { ...NO_EXTRAS, isin: inst.providerId.split('-')[0] };
  },
};
