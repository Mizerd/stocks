import { STOCKS } from '../../shared/catalog';
import type { Candle, Instrument, Quote } from '../../shared/types';
import { EXCHANGES, zonedTime } from '../../shared/exchanges';
import { daysAgo, fetchText, isoDay, LIVE_GRACE, num, shared, UpstreamError } from '../http';
import { emptyFundamentals, NO_EXTRAS, type DetailExtras, type Provider } from './provider';

const BASE = 'https://live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax';
const LIST = 'https://live.euronext.com/en/product_directory/data/stocks-paris';
// Markets whose share lists carry live (delayed) prices. Other lines, like SAP's EuroTLX one, are quoted end of day.
export const LIST_MICS = ['XPAR', 'XAMS', 'MTAA'];

export interface EuronextRow {
  price: number;
  changePct: number;
  time: string;
}

const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
// Euronext publishes no sectors in bulk, so only the catalogue's lines are covered.
const COVERED = new Set(STOCKS.filter((s) => s.provider === 'euronext').map((s) => s.providerId));

// The stock directory's table data for one market: one row per line, keyed by its "ISIN-MIC" product code.
// Cells: name link, ISIN, symbol, market, "EUR <span>price</span>", "1.46%", "13:46 CET<span>11 Nov 2026</span>"
// (or "13 Nov 2026<span>17:35 CET</span>").
// Only the `wanted` lines are read.
export function parseEuronextList(json: any, mic: string, wanted: ReadonlySet<string>): Record<string, EuronextRow> {
  const rows: Record<string, EuronextRow> = {};
  // Most rows share a handful of trade minutes; each is converted once.
  const instants = new Map<string, string>();
  for (const cells of json?.aaData ?? []) {
    const id = `${cells[1]}-${mic}`;
    if (!wanted.has(id)) continue;
    const price = num(String(cells[4]).match(/pd_last_price_es">([^<]*)/)?.[1]);
    // The time and the date swap places in the cell from time to time, so each is read on its own.
    const hhmm = String(cells[6]).match(/\d{2}:\d{2}/)?.[0];
    const date = String(cells[6]).match(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
    if (price === null || !hhmm || !date) continue;
    const month = String(MONTHS.indexOf(date[2]) / 3 + 1).padStart(2, '0');
    const day = `${date[3]}-${month}-${date[1].padStart(2, '0')}`;
    const stamp = `${day} ${hhmm}`;
    if (!instants.has(stamp)) instants.set(stamp, zonedTime(day, hhmm, 'Europe/Paris').toISOString());
    rows[id] = { price, changePct: num(String(cells[5]).replace(/<[^>]+>/g, '')) ?? 0, time: instants.get(stamp)! };
  }
  return rows;
}

// One market's whole list (a few hundred rows) in one call. The site often takes seconds to answer, hence the
// longer timeout; asking for fewer rows is no faster. Each row carries its own trade time.
export function euronextList(mic: string): Promise<Record<string, EuronextRow>> {
  return shared(`euronext:list:${mic}`, 60, async () => {
    const form = 'iDisplayStart=0&iDisplayLength=2000';
    const json = JSON.parse(await fetchText(`${LIST}?mics=${mic}`, 'application/json', { form, timeoutMs: 15000 }));
    const rows = parseEuronextList(json, mic, COVERED);
    if (Object.keys(rows).length === 0) throw new UpstreamError(`Euronext returned no ${mic} shares`);
    return rows;
  }, LIVE_GRACE);
}

const listMic = (inst: Instrument) => inst.providerId.split('-')[1];

async function euronextLive(inst: Instrument): Promise<EuronextRow | undefined> {
  const mic = listMic(inst);
  if (!LIST_MICS.includes(mic)) return undefined;
  return (await euronextList(mic).catch(() => undefined))?.[inst.providerId];
}

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

const factsheetText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// Factsheet blocks, for the heatmap data script: "Admitted shares 388,147,751" and "SuperSector 1010, Technology".
export function parseAdmittedShares(html: string): number | null {
  return num(factsheetText(html).match(/Admitted shares ([\d,]+)/i)?.[1]) || null;
}

export function parseIcbSupersector(html: string): string | null {
  return factsheetText(html).match(/SuperSector (\d{4}),/i)?.[1] ?? null;
}

// The list gives the price and the percentage change; the change in money follows from them.
export function liveQuote(row: EuronextRow) {
  const prevClose = Number((row.price / (1 + row.changePct / 100)).toPrecision(8));
  return { price: row.price, change: Number((row.price - prevClose).toPrecision(8)), changePct: row.changePct };
}

export const euronext: Provider = {
  // The live list has no volume or day range; those come from the end-of-day file when it covers the same day.
  async quote(inst, dailyBars) {
    const [daily, live] = await Promise.all([dailyBars, euronextLive(inst)]);
    const last = daily[daily.length - 1];
    const prev = daily[daily.length - 2];
    if (live) {
      const sameDay = last && isoDay(new Date(last.t)) === live.time.slice(0, 10);
      const quote = liveQuote(live);
      return {
        ...quote,
        prevClose: quote.price - quote.change,
        open: sameDay ? last.o : null,
        high: sameDay ? last.h : null,
        low: sameDay ? last.l : null,
        volume: sameDay ? last.v : null,
        time: live.time,
        freshness: 'delayed',
        ...emptyFundamentals(),
      };
    }
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
    return parseEuronextCsv(await fetchText(url, 'text/csv'));
  },

  async intraday() {
    return null;
  },

  async details(inst): Promise<DetailExtras> {
    return { ...NO_EXTRAS, isin: inst.providerId.split('-')[0] };
  },
};
