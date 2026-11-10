import type { Candle, Instrument, QuarterFigure, Quote } from '../../shared/types';
import { zonedTime } from '../../shared/exchanges';
import { cachedText, daysAgo, isoDay, num, UpstreamError } from '../http';
import type { DetailExtras, Intraday, Provider } from './provider';

const API = 'https://api.nasdaq.com/api';

async function get(path: string, ttl: number): Promise<any> {
  const json = JSON.parse(await cachedText(`${API}${path}`, ttl));
  if (!json.data) throw new UpstreamError(`Nasdaq has no data for ${path}`);
  return json.data;
}

// Failing optional calls (fundamentals) must not take the quote down with them.
async function tryGet(path: string, ttl: number): Promise<any | null> {
  try {
    return await get(path, ttl);
  } catch {
    return null;
  }
}

const assetClass = (inst: Instrument) => (inst.kind === 'index' ? 'index' : 'stocks');

// "Nov 10, 2026 9:34 AM ET" or "Nov 9, 2026" -> ISO instant.
export function parseNasdaqTime(text: string): string {
  const m = text.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) (AM|PM))?/);
  if (!m) return new Date().toISOString();
  const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[1]) / 3 + 1;
  const day = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  let hour = m[4] ? Number(m[4]) % 12 : 16;
  if (m[6] === 'PM') hour += 12;
  const hhmm = `${String(hour).padStart(2, '0')}:${m[5] ?? '00'}`;
  return zonedTime(day, hhmm, 'America/New_York').toISOString();
}

export function parseNasdaqRows(rows: any[]): Candle[] {
  return rows
    .map((r) => {
      const [month, day, year] = r.date.split('/');
      const c = num(r.close);
      return {
        t: Date.UTC(Number(year), Number(month) - 1, Number(day)),
        o: num(r.open) ?? c,
        h: num(r.high) ?? c,
        l: num(r.low) ?? c,
        c,
        v: num(r.volume),
      };
    })
    .filter((c): c is Candle => c.c !== null && c.c > 0)
    .reverse();
}

function trailingEps(epsData: any): number | null {
  const reported: number[] = (epsData?.earningsPerShare ?? [])
    .filter((q: any) => q.type === 'PreviousQuarter')
    .map((q: any) => q.earnings);
  if (reported.length < 4) return null;
  return reported.slice(-4).reduce((a, b) => a + b, 0);
}

export const nasdaq: Provider = {
  async quote(inst) {
    const cls = assetClass(inst);
    const [info, summary, epsData] = await Promise.all([
      get(`/quote/${inst.providerId}/info?assetclass=${cls}`, 60),
      inst.kind === 'stock' ? tryGet(`/quote/${inst.providerId}/summary?assetclass=${cls}`, 300) : null,
      inst.kind === 'stock' ? tryGet(`/quote/${inst.providerId}/eps`, 6 * 3600) : null,
    ]);
    const primary = info.primaryData;
    const price = num(primary.lastSalePrice);
    if (price === null) throw new UpstreamError(`Nasdaq returned no price for ${inst.symbol}`);
    const change = num(primary.netChange) ?? 0;
    const s = summary?.summaryData ?? {};
    const [high, low] = String(s.TodayHighLow?.value ?? '').split('/').map(num);
    const eps = trailingEps(epsData);
    const quote: Quote = {
      price,
      change,
      changePct: num(primary.percentageChange) ?? 0,
      prevClose: num(s.PreviousClose?.value) ?? price - change,
      open: null,
      high: high ?? null,
      low: low ?? null,
      volume: roundOrNull(num(primary.volume) ?? num(s.ShareVolume?.value)),
      time: parseNasdaqTime(primary.lastTradeTimestamp ?? ''),
      freshness: primary.isRealTime ? 'realtime' : 'delayed',
      marketCap: num(s.MarketCap?.value),
      pe: eps && eps > 0 ? price / eps : null,
      eps,
      dividend: num(s.AnnualizedDividend?.value),
      dividendYield: num(s.Yield?.value),
      avgVolume: num(s.AverageVolume?.value),
    };
    return quote;
  },

  async daily(inst, years) {
    const from = isoDay(daysAgo(Math.round(years * 365.25)));
    const to = isoDay(new Date());
    const data = await get(
      `/quote/${inst.providerId}/historical?assetclass=${assetClass(inst)}&fromdate=${from}&todate=${to}&limit=2000`,
      3600,
    );
    return parseNasdaqRows(data.tradesTable?.rows ?? []);
  },

  async intraday(inst): Promise<Intraday> {
    const data = await get(`/quote/${inst.providerId}/chart?assetclass=${assetClass(inst)}`, 120);
    // The feed stamps points with New York wall-clock time written as if it were UTC.
    const points: { t: number; price: number }[] = [];
    for (const p of data.chart ?? []) {
      const wall = new Date(p.x).toISOString();
      const hhmm = wall.slice(11, 16);
      if (hhmm < '09:30' || hhmm > '16:00') continue;
      points.push({ t: zonedTime(wall.slice(0, 10), hhmm, 'America/New_York').getTime(), price: p.y });
    }
    return { candles: bucket(points, 5), prevClose: num(data.previousClose) };
  },

  async details(inst): Promise<DetailExtras> {
    const id = inst.providerId;
    const [profile, epsData, financials, target] = await Promise.all([
      tryGet(`/company/${id}/company-profile`, 24 * 3600),
      tryGet(`/quote/${id}/eps`, 6 * 3600),
      tryGet(`/company/${id}/financials?frequency=2`, 24 * 3600),
      tryGet(`/analyst/${id}/targetprice`, 6 * 3600),
    ]);

    const quarterlyEps: QuarterFigure[] = (epsData?.earningsPerShare ?? [])
      .filter((q: any) => q.type === 'PreviousQuarter')
      .map((q: any) => ({ period: q.period, value: q.earnings, estimate: q.consensus }));

    const income = financials?.incomeStatementTable;
    const revenueRow = income?.rows?.find((r: any) => r.value1 === 'Total Revenue');
    const quarterlyRevenue: QuarterFigure[] = [];
    if (revenueRow) {
      for (const key of ['value5', 'value4', 'value3', 'value2']) {
        const value = num(revenueRow[key]);
        // Figures are reported in thousands of dollars.
        if (value !== null && income.headers[key]) quarterlyRevenue.push({ period: income.headers[key], value: value * 1000 });
      }
    }

    const consensus = target?.consensusOverview;
    return {
      isin: null,
      industry: profile?.Industry?.value ?? null,
      description: profile?.CompanyDescription?.value ?? null,
      quarterlyEps,
      quarterlyRevenue,
      analysts: consensus
        ? { buy: consensus.buy, hold: consensus.hold, sell: consensus.sell, target: consensus.priceTarget ?? null }
        : null,
    };
  },
};

const roundOrNull = (value: number | null) => (value === null ? null : Math.round(value));

// Groups price ticks into fixed-minute OHLC bars.
export function bucket(points: { t: number; price: number; volume?: number }[], minutes: number): Candle[] {
  const size = minutes * 60000;
  const bars = new Map<number, Candle>();
  for (const p of points) {
    const t = Math.floor(p.t / size) * size;
    const bar = bars.get(t);
    if (!bar) {
      bars.set(t, { t, o: p.price, h: p.price, l: p.price, c: p.price, v: p.volume ?? null });
    } else {
      bar.h = Math.max(bar.h, p.price);
      bar.l = Math.min(bar.l, p.price);
      bar.c = p.price;
      if (p.volume != null) bar.v = (bar.v ?? 0) + p.volume;
    }
  }
  return [...bars.values()].sort((a, b) => a.t - b.t);
}
