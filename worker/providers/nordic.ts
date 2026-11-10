import type { Candle, Instrument, Quote } from '../../shared/types';
import { EXCHANGES, zonedTime } from '../../shared/exchanges';
import { cachedText, daysAgo, isoDay, num, UpstreamError } from '../http';
import { bucket } from './nasdaq';
import { NO_EXTRAS, type DetailExtras, type Intraday, type Provider } from './provider';

const API = 'https://api.nasdaq.com/api/nordic/instruments';

async function get(inst: Instrument, path: string, ttl: number): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const json = JSON.parse(await cachedText(`${API}/${inst.providerId}/${path}${sep}assetClass=SHARES&lang=en`, ttl));
  if (!json.data) throw new UpstreamError(`Nasdaq Nordic has no data for ${inst.symbol}`);
  return json.data;
}

// "2026-11-10 15:26:17 CET" -> ISO instant in the exchange's timezone.
function parseTime(text: string, timezone: string): string {
  const m = text.match(/(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/);
  if (!m) return new Date().toISOString();
  return zonedTime(m[1], m[2] ?? '17:00', timezone).toISOString();
}

export function parseNordicChart(points: any[]): Candle[] {
  return points
    .map((p) => {
      const c = num(p.z.close) ?? p.y;
      return {
        t: p.x * 1000,
        o: num(p.z.open) ?? c,
        h: num(p.z.high) ?? c,
        l: num(p.z.low) ?? c,
        c,
        v: num(p.z.volume),
      };
    })
    .filter((c) => c.c > 0);
}

export const nordic: Provider = {
  async quote(inst) {
    const [info, summary] = await Promise.all([get(inst, 'info', 60), get(inst, 'summary', 300)]);
    const header = info.qdHeader;
    const primary = header.primaryData;
    const price = num(primary.lastSalePrice);
    if (price === null) throw new UpstreamError(`Nasdaq Nordic returned no price for ${inst.symbol}`);
    const change = num(primary.netChange) ?? 0;
    const s = summary.summaryData ?? {};
    const [low, high] = String(s.todayHighLow?.value ?? '').split('/').map(num);
    const quote: Quote = {
      price,
      change,
      changePct: num(primary.percentageChange) ?? 0,
      prevClose: price - change,
      open: num(s.openingPrice?.value),
      high: high ?? null,
      low: low ?? null,
      volume: num(s.volume?.value),
      time: parseTime(primary.lastTradeTimestamp ?? '', EXCHANGES[inst.exchange].timezone),
      freshness: 'delayed',
      marketCap: num(s.marketCap?.value),
      pe: null,
      eps: null,
      dividend: null,
      dividendYield: null,
      avgVolume: null,
    };
    return quote;
  },

  async daily(inst, years) {
    const from = isoDay(daysAgo(Math.round(years * 365.25)));
    const data = await get(inst, `chart?fromDate=${from}&toDate=${isoDay(new Date())}`, 3600);
    return parseNordicChart(data.CP ?? []);
  },

  async intraday(inst): Promise<Intraday> {
    const data = await get(inst, 'chart', 120);
    const points = (data.CP ?? []).map((p: any) => ({ t: p.x * 1000, price: p.y }));
    return { candles: bucket(points, 5), prevClose: num(data.chartData?.previousClose) };
  },

  async details(inst): Promise<DetailExtras> {
    const summary = await get(inst, 'summary', 300);
    return { ...NO_EXTRAS, isin: summary.summaryData?.isin?.value ?? null };
  },
};
