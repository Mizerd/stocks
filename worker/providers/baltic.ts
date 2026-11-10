import { unzipSync, strFromU8 } from 'fflate';
import type { Candle, Instrument, Quote } from '../../shared/types';
import { EXCHANGES, zonedParts, zonedTime, type Exchange } from '../../shared/exchanges';
import { cachedBytes, cachedText, daysAgo, isoDay, num, UpstreamError } from '../http';
import { bucket } from './nasdaq';
import { emptyFundamentals, NO_EXTRAS, type DetailExtras, type Intraday, type Provider } from './provider';

const BASE = 'https://nasdaqbaltic.com/statistics/en';

export interface BalticRow {
  last: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  prevClose: number | null;
}

const cellText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The public share list page: one table row per share, keyed here by ISIN.
export function parseBalticShareList(html: string): { asOf: string | null; rows: Map<string, BalticRow> } {
  const rows = new Map<string, BalticRow>();
  for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const isin = tr.match(/instrument\/([A-Z]{2}[A-Z0-9]{10})\/trading/)?.[1];
    if (!isin) continue;
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(cellText);
    // Company, Ticker, Last, +/-, %, Bid, Ask, Trades, Volume, Turnover, Previous close, ...
    rows.set(isin, {
      last: num(cells[2]),
      change: num(cells[3]),
      changePct: num(cells[4]),
      volume: num(cells[8]),
      prevClose: num(cells[10]),
    });
  }
  const asOf = html.match(/Last update:\s*(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})/)?.[1] ?? null;
  return { asOf, rows };
}

// "10.11.2026 16:22" in Vilnius time -> ISO instant.
function parseAsOf(text: string | null): string | null {
  const m = text?.match(/(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2})/);
  if (!m) return null;
  return zonedTime(`${m[3]}-${m[2]}-${m[1]}`, m[4], 'Europe/Vilnius').toISOString();
}

// The list page keeps refreshing its "last update" stamp after the close, so cap it at the bell.
function quoteTime(asOf: string | null, ex: Exchange): string {
  const stamp = parseAsOf(asOf) ?? new Date().toISOString();
  const close = zonedTime(zonedParts(new Date(stamp), ex.timezone).day, ex.close, ex.timezone).toISOString();
  return stamp < close ? stamp : close;
}

// The exchange's price-history export is an .xlsx file. Columns:
// Date, Average, Open, High, Low, Close, Last, Adj. factor, Last adjusted, Change %, Bid, Ask, Trades, Volume, ...
export function parseBalticXlsx(file: Uint8Array): Candle[] {
  const sheet = unzipSync(file)['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new UpstreamError('Unexpected Nasdaq Baltic export format');
  const candles: Candle[] = [];
  for (const row of strFromU8(sheet).match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells = new Map<string, number>();
    for (const m of row.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>)?/g)) {
      // t="s" cells are text (shared strings); only numbers matter here.
      if (!m[2].includes('t="s"') && m[3] !== undefined) cells.set(m[1], Number(m[3]));
    }
    const serial = cells.get('A');
    const close = cells.get('F') || cells.get('G');
    if (!serial || !close) continue;
    candles.push({
      t: Math.round((serial - 25569) * 86400000),
      o: cells.get('C') || close,
      h: cells.get('D') || close,
      l: cells.get('E') || close,
      c: close,
      v: cells.get('N') ?? null,
    });
  }
  return candles.sort((a, b) => a.t - b.t);
}

async function shareList() {
  return parseBalticShareList(await cachedText(`${BASE}/shares`, 60, 'text/html'));
}

async function indexSeries(inst: Instrument, years: number): Promise<Candle[]> {
  const from = isoDay(daysAgo(Math.round(years * 365.25)));
  const url = `${BASE}/charts/charts_data_json?filter=1&indexes%5B%5D=${inst.providerId}&start=${from}&end=${isoDay(new Date())}`;
  const json = JSON.parse(await cachedText(url, 900));
  const chart = json.data?.charts?.find((c: any) => c.id === inst.providerId);
  if (!chart) throw new UpstreamError(`Nasdaq Baltic has no data for ${inst.symbol}`);
  return chart.data.map(([t, value]: [number, number]) => ({ t: dayStart(t), o: value, h: value, l: value, c: value, v: null }));
}

const dayStart = (t: number) => Math.floor(t / 86400000) * 86400000;

export const baltic: Provider = {
  async quote(inst, daily) {
    const ex = EXCHANGES[inst.exchange];
    if (inst.kind === 'index') {
      // Index values come from the daily series: today's value updates during the session.
      const last = daily[daily.length - 1];
      const prev = daily[daily.length - 2];
      if (!last || !prev) throw new UpstreamError(`Nasdaq Baltic returned no values for ${inst.symbol}`);
      const day = isoDay(new Date(last.t));
      const isToday = day === zonedParts(new Date(), ex.timezone).day;
      return {
        price: last.c, change: last.c - prev.c, changePct: ((last.c - prev.c) / prev.c) * 100, prevClose: prev.c,
        open: null, high: null, low: null, volume: null,
        time: isToday ? new Date().toISOString() : zonedTime(day, ex.close, ex.timezone).toISOString(),
        freshness: 'delayed',
        ...emptyFundamentals(),
      };
    }

    const list = await shareList();
    const row = list.rows.get(inst.providerId);
    const lastBar = daily[daily.length - 1];
    const price = row?.last ?? lastBar?.c;
    if (!price) throw new UpstreamError(`Nasdaq Baltic returned no price for ${inst.symbol}`);
    const prevClose = row?.prevClose ?? price - (row?.change ?? 0);
    const quote: Quote = {
      price,
      change: row?.change ?? price - prevClose,
      changePct: row?.changePct ?? ((price - prevClose) / prevClose) * 100,
      prevClose,
      open: lastBar?.o ?? null,
      high: lastBar?.h ?? null,
      low: lastBar?.l ?? null,
      volume: row?.volume ?? null,
      time: quoteTime(list.asOf, ex),
      freshness: 'delayed',
      ...emptyFundamentals(),
    };
    return quote;
  },

  async daily(inst, years) {
    if (inst.kind === 'index') return indexSeries(inst, years);
    const from = isoDay(daysAgo(Math.round(years * 365.25)));
    const url = `${BASE}/instrument/${inst.providerId}/trading/chart_price_download?start=${from}&end=${isoDay(new Date())}`;
    return parseBalticXlsx(await cachedBytes(url, 900));
  },

  async intraday(inst): Promise<Intraday | null> {
    if (inst.kind === 'index') return null;
    const today = zonedParts(new Date(), 'Europe/Vilnius').day;
    const url = `${BASE}/instrument/${inst.providerId}/trading/chart_price_json?start=${today}&end=${today}`;
    const data = JSON.parse(await cachedText(url, 120)).data;
    if (data?.chart_type !== 'intraday') return null;
    const points = (data.data ?? []).map(([t, price, volume]: number[]) => ({ t, price, volume }));
    return { candles: bucket(points, 5), prevClose: data.prev_last_price ?? null };
  },

  async details(inst): Promise<DetailExtras> {
    return { ...NO_EXTRAS, isin: inst.kind === 'stock' ? inst.providerId : null };
  },
};
