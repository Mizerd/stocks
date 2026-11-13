import type { Candle, Instrument, Quote } from '../../shared/types';
import { EXCHANGES, zonedTime } from '../../shared/exchanges';
import { cachedJson, daysAgo, fetchText, isoDay, num, UpstreamError } from '../http';
import { bucket } from './nasdaq';
import { NO_EXTRAS, type DetailExtras, type Intraday, type Provider } from './provider';

const API = 'https://api.nasdaq.com/api/nordic';

// ttl 0: not kept, for results the caller keeps in parsed form itself.
async function get(inst: Instrument, path: string, ttl: number): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}/instruments/${inst.providerId}/${path}${sep}assetClass=SHARES&lang=en`;
  const json = ttl > 0 ? await cachedJson(url, ttl) : JSON.parse(await fetchText(url));
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
    const data = await get(inst, `chart?fromDate=${from}&toDate=${isoDay(new Date())}`, 0);
    return parseNordicChart(data.CP ?? []);
  },

  async intraday(inst): Promise<Intraday> {
    const data = await get(inst, 'chart', 0);
    const points = (data.CP ?? []).map((p: any) => ({ t: p.x * 1000, price: p.y }));
    return { candles: bucket(points, 1), prevClose: num(data.chartData?.previousClose) };
  },

  async details(inst): Promise<DetailExtras> {
    const summary = await get(inst, 'summary', 300);
    return { ...NO_EXTRAS, isin: summary.summaryData?.isin?.value ?? null };
  },
};

export type NordicMarket = 'HEL' | 'CPH' | 'STO';

export interface NordicRow {
  orderbookId: string;
  ticker: string;
  name: string;
  isin: string;
  currency: string;
  sector: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
}

// The share screener: every main-market share of one exchange with its last price, in one call.
export function parseNordicScreener(json: any): NordicRow[] {
  return (json?.data?.instrumentListing?.rows ?? []).map((r: any) => ({
    orderbookId: r.orderbookId,
    ticker: r.symbol,
    name: r.fullName,
    isin: r.isin,
    currency: r.currency,
    sector: r.sector,
    price: num(r.lastSalePrice),
    change: num(r.netChange),
    changePct: num(r.percentageChange),
    volume: num(r.volume),
  }));
}

export async function nordicScreener(market: NordicMarket): Promise<NordicRow[]> {
  const url = `${API}/screener/shares?category=MAIN_MARKET&tableonly=true&market=${market}`;
  const rows = parseNordicScreener(JSON.parse(await fetchText(url)));
  if (rows.length === 0) throw new UpstreamError(`Nasdaq Nordic screener returned no ${market} shares`);
  return rows;
}
