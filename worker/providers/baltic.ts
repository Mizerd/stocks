import type { Candle, Instrument, Quote } from '../../shared/types';
import { EXCHANGES, zonedParts, zonedTime, type Exchange, lastSessionTime } from '../../shared/exchanges';
import { fetchBytes, fetchText, daysAgo, isoDay, LIVE_GRACE, num, shared, UpstreamError } from '../http';
import { unzipFile } from '../unzip';
import { bucket } from './nasdaq';
import { emptyFundamentals, NO_EXTRAS, type DetailExtras, type Intraday, type Provider } from './provider';

const BASE = 'https://nasdaqbaltic.com/statistics/en';

export interface BalticRow {
  isin: string;
  ticker: string;
  name: string;
  // Industry name, e.g. "Utilities".
  industry: string;
  // VLN, RIG or TLN.
  home: string;
  last: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  prevClose: number | null;
}

const decode = (text: string) =>
  text.replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&').trim();
const cellText = (html: string) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

// The public share list page (main, secondary and First North lists): one table row per share, keyed by ISIN.
export function parseBalticShareList(html: string): { asOf: string | null; rows: Record<string, BalticRow> } {
  const rows: Record<string, BalticRow> = {};
  for (const tr of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const isin = tr.match(/instrument\/([A-Z]{2}[A-Z0-9]{10})\/trading/)?.[1];
    if (!isin) continue;
    const cells = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
    // Only the cells read below are cleaned up.
    const text = (i: number) => cells[i] && cellText(cells[i]);
    // Company, Ticker, Last, +/-, %, Bid, Ask, Trades, Volume, Turnover, Previous close, Industry, Supersector, Home, ...
    rows[isin] = {
      isin,
      ticker: text(1),
      name: decode(tr.match(/data-sort-by="([^"]*)"/)?.[1] ?? text(0)),
      industry: decode(cells[11]?.match(/title="([^"]*)"/)?.[1] ?? ''),
      home: text(13),
      last: num(text(2)),
      change: num(text(3)),
      changePct: num(text(4)),
      volume: num(text(8)),
      prevClose: num(text(10)),
    };
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
export function quoteTime(asOf: string | null, ex: Exchange): string {
  // The list keeps refreshing its stamp after the bell and over weekends.
  return lastSessionTime(ex, new Date(parseAsOf(asOf) ?? Date.now())).toISOString();
}

// The exchange's price-history export is an .xlsx file; this reads its only sheet. Columns:
// Date, Average, Open, High, Low, Close, Last (the reported price), Adj. factor, Last adjusted, Change %, Bid, Ask, Trades, Volume, ...
export function parseBalticSheet(xml: string): Candle[] {
  // One pass over the numeric cells of the needed columns; text cells (t="s") have another shape and never match.
  // A row's cells sit together, so a new row number starts a new row.
  const rows: Record<string, number>[] = [];
  let rowNumber = '';
  for (const m of xml.matchAll(/<c r="([ACDEFGN])(\d+)"(?: s="\d+")?><v>([^<]*)<\/v>/g)) {
    if (m[2] !== rowNumber) {
      rowNumber = m[2];
      rows.push({});
    }
    rows[rows.length - 1][m[1]] = Number(m[3]);
  }
  const candles: Candle[] = [];
  for (const { A: serial, C, D, E, F, G, N } of rows) {
    const close = G || F;
    if (!serial || !close) continue;
    candles.push({
      t: Math.round((serial - 25569) * 86400000),
      o: C || close,
      h: D || close,
      l: E || close,
      c: close,
      v: N ?? null,
    });
  }
  return candles.sort((a, b) => a.t - b.t);
}

// Parsed once a minute per data centre; both the bulk quotes and single quotes read it.
export function balticShareList() {
  return shared('baltic:shares', 60, async () => {
    const list = parseBalticShareList(await fetchText(`${BASE}/shares`, 'text/html'));
    if (Object.keys(list.rows).length === 0) throw new UpstreamError('Nasdaq Baltic share list is unavailable');
    return list;
  }, LIVE_GRACE);
}

async function indexSeries(inst: Instrument, years: number): Promise<Candle[]> {
  const from = isoDay(daysAgo(Math.round(years * 365.25)));
  const url = `${BASE}/charts/charts_data_json?filter=1&indexes%5B%5D=${inst.providerId}&start=${from}&end=${isoDay(new Date())}`;
  const json = JSON.parse(await fetchText(url));
  const chart = json.data?.charts?.find((c: any) => c.id === inst.providerId);
  if (!chart) throw new UpstreamError(`Nasdaq Baltic has no data for ${inst.symbol}`);
  return chart.data.map(([t, value]: [number, number]) => ({ t: dayStart(t), o: value, h: value, l: value, c: value, v: null }));
}

// Every trade of one day, past or present.
async function dayChart(inst: Instrument, day: string): Promise<Intraday | null> {
  const url = `${BASE}/instrument/${inst.providerId}/trading/chart_price_json?start=${day}&end=${day}`;
  const data = JSON.parse(await fetchText(url)).data;
  if (data?.chart_type !== 'intraday') return null;
  const points = (data.data ?? []).map(([t, price, volume]: number[]) => ({ t, price, volume }));
  return { candles: bucket(points, 1), prevClose: data.prev_last_price ?? null };
}

const dayStart = (t: number) => Math.floor(t / 86400000) * 86400000;

export const baltic: Provider = {
  async quote(inst, dailyBars) {
    const ex = EXCHANGES[inst.exchange];
    const [daily, list] = await Promise.all([dailyBars, inst.kind === 'index' ? null : balticShareList().catch(() => null)]);
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

    const row = list?.rows[inst.providerId];
    const lastBar = daily[daily.length - 1];
    const prevBar = daily[daily.length - 2];

    // Without the live list (it is sometimes refused), fall back to the last daily close.
    if (!list || row?.last == null) {
      if (!lastBar || !prevBar) throw new UpstreamError(`Nasdaq Baltic returned no price for ${inst.symbol}`);
      return {
        price: lastBar.c, change: lastBar.c - prevBar.c, changePct: (lastBar.c / prevBar.c - 1) * 100, prevClose: prevBar.c,
        open: lastBar.o, high: lastBar.h, low: lastBar.l, volume: lastBar.v,
        time: zonedTime(isoDay(new Date(lastBar.t)), ex.close, ex.timezone).toISOString(),
        freshness: 'eod',
        ...emptyFundamentals(),
      };
    }

    const price = row.last;
    const prevClose = row.prevClose ?? price - (row.change ?? 0);
    const quote: Quote = {
      price,
      change: row.change ?? price - prevClose,
      changePct: row.changePct ?? (price / prevClose - 1) * 100,
      prevClose,
      open: lastBar?.o ?? null,
      high: lastBar?.h ?? null,
      low: lastBar?.l ?? null,
      volume: row.volume,
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
    const sheet = await unzipFile(await fetchBytes(url), 'xl/worksheets/sheet1.xml');
    if (sheet === null) throw new UpstreamError('Unexpected Nasdaq Baltic export format');
    return parseBalticSheet(sheet);
  },

  async intraday(inst) {
    return inst.kind === 'index' ? null : dayChart(inst, zonedParts(new Date(), 'Europe/Vilnius').day);
  },

  async pastIntraday(inst, day) {
    return inst.kind === 'index' ? null : dayChart(inst, day);
  },

  async details(inst): Promise<DetailExtras> {
    return { ...NO_EXTRAS, isin: inst.kind === 'stock' ? inst.providerId : null };
  },
};
