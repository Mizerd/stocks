import type { Candle, ExchangeId, ExtendedQuote, Instrument, QuarterFigure, Quote, Upcoming } from '../../shared/types';
import { US_PREMARKET_OPEN, zonedParts, zonedTime } from '../../shared/exchanges';
import { cachedJson, daysAgo, fetchText, isoDay, num, shared, UpstreamError } from '../http';
import { NO_UPCOMING, type DetailExtras, type Intraday, type Provider } from './provider';

const API = 'https://api.nasdaq.com/api';
const NEW_YORK = 'America/New_York';

// ttl 0: not kept, for results the caller keeps in parsed form itself.
async function get(path: string, ttl: number): Promise<any> {
  const url = `${API}${path}`;
  const json = ttl > 0 ? await cachedJson(url, ttl) : JSON.parse(await fetchText(url));
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

// "Nov 10, 2026 9:34 AM ET" or "Nov 9, 2026" (the close, 16:00) -> ISO instant.
export function parseNasdaqTime(text: string): string {
  return nasdaqTime(text) ?? new Date().toISOString();
}

function nasdaqTime(text: string): string | null {
  const m = text.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) (AM|PM))?/);
  if (!m) return null;
  const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[1]) / 3 + 1;
  const day = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  let hour = m[4] ? Number(m[4]) % 12 : 16;
  if (m[6] === 'PM') hour += 12;
  const hhmm = `${String(hour).padStart(2, '0')}:${m[5] ?? '00'}`;
  return zonedTime(day, hhmm, NEW_YORK).toISOString();
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

// Before the open and after the close, Nasdaq gives the latest extended-hours trade as primaryData
// and the regular session's close as secondaryData ("Closed at Nov 12, 2026 4:00 PM ET").
export function parseNasdaqInfo(info: any) {
  const closed = String(info.secondaryData?.lastTradeTimestamp ?? '').startsWith('Closed') ? info.secondaryData : null;
  const regular = closed ?? info.primaryData;
  const price = num(regular.lastSalePrice);
  const time = parseNasdaqTime(regular.lastTradeTimestamp ?? '');
  let extended: ExtendedQuote | undefined;
  const lastTrade = closed && num(info.primaryData.lastSalePrice);
  if (price !== null && lastTrade) {
    const tradeTime = parseNasdaqTime(info.primaryData.lastTradeTimestamp ?? '');
    const minutes = zonedParts(new Date(tradeTime), NEW_YORK).minutes;
    const change = lastTrade - price;
    if (tradeTime > time) {
      extended = { session: minutes < 9 * 60 + 30 ? 'pre' : 'post', price: lastTrade, change, changePct: (change / price) * 100, time: tradeTime };
    }
  }
  return {
    price,
    change: num(regular.netChange) ?? 0,
    changePct: num(regular.percentageChange) ?? 0,
    volume: num(regular.volume),
    time,
    // Also when Nasdaq gives the close alone, overnight.
    closed: String(regular.lastTradeTimestamp ?? '').startsWith('Closed'),
    realtime: Boolean(info.primaryData.isRealTime),
    extended,
  };
}

// The daily bar of the session a quote belongs to, once Nasdaq has added it (after the session).
// Nasdaq publishes no opening price otherwise.
export function sessionBar(daily: Candle[], time: string): Candle | null {
  const last = daily[daily.length - 1];
  return last && isoDay(new Date(last.t)) === zonedParts(new Date(time), NEW_YORK).day ? last : null;
}

const usDay = (text: unknown) => {
  const m = String(text ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

// "… is expected* to report earnings on  12/09/2026 after market close." or "… is estimated to report earnings on  12/09/2026."
export function parseEarningsDate(data: any, today: string): Upcoming['earnings'] {
  const text = String(data?.reportText ?? '');
  const day = usDay(text.match(/report earnings on\s+([\d/]+)/)?.[1]);
  if (!day || day < today) return null;
  const timing = /before market open/.test(text) ? 'pre' : /after market close/.test(text) ? 'post' : null;
  return { day, estimated: /is estimated/.test(text), timing };
}

// The latest declared dividend, newest row first, while its ex-date or payment is still ahead.
export function parseNextDividend(data: any, today: string): Upcoming['dividend'] {
  const row = data?.dividends?.rows?.[0];
  const ahead = (text: unknown) => {
    const day = usDay(text);
    return day && day >= today ? day : null;
  };
  const exDay = ahead(row?.exOrEffDate);
  const payDay = ahead(row?.paymentDate);
  return exDay || payDay ? { exDay, payDay, amount: num(row.amount) } : null;
}

export const nasdaq: Provider = {
  async quote(inst, daily) {
    const cls = assetClass(inst);
    const [info, summary, epsData, bars] = await Promise.all([
      get(`/quote/${inst.providerId}/info?assetclass=${cls}`, 60),
      inst.kind === 'stock' ? tryGet(`/quote/${inst.providerId}/summary?assetclass=${cls}`, 300) : null,
      inst.kind === 'stock' ? tryGet(`/quote/${inst.providerId}/eps`, 6 * 3600) : null,
      daily.catch(() => []),
    ]);
    const { price, change, changePct, volume, time, closed, realtime, extended } = parseNasdaqInfo(info);
    if (price === null) throw new UpstreamError(`Nasdaq returned no price for ${inst.symbol}`);
    const s = summary?.summaryData ?? {};
    const [high, low] = String(s.TodayHighLow?.value ?? '').split('/').map(num);
    const eps = trailingEps(epsData);
    const bar = sessionBar(bars, time);
    const quote: Quote = {
      price,
      change,
      changePct,
      // Outside the session Nasdaq's previous close is the close shown as the price, and its volumes count extended-hours trades.
      prevClose: (closed ? null : num(s.PreviousClose?.value)) ?? price - change,
      open: bar?.o ?? null,
      high: high ?? bar?.h ?? null,
      low: low ?? bar?.l ?? null,
      volume: roundOrNull(closed ? (bar?.v ?? null) : (volume ?? num(s.ShareVolume?.value))),
      time,
      freshness: realtime ? 'realtime' : 'delayed',
      marketCap: num(s.MarketCap?.value),
      pe: eps && eps > 0 ? price / eps : null,
      eps,
      dividend: num(s.AnnualizedDividend?.value),
      dividendYield: num(s.Yield?.value),
      avgVolume: num(s.AverageVolume?.value),
      extended,
    };
    return quote;
  },

  async daily(inst, years) {
    const from = isoDay(daysAgo(Math.round(years * 365.25)));
    const to = isoDay(new Date());
    const data = await get(
      `/quote/${inst.providerId}/historical?assetclass=${assetClass(inst)}&fromdate=${from}&todate=${to}&limit=2000`,
      0,
    );
    return parseNasdaqRows(data.tradesTable?.rows ?? []);
  },

  async intraday(inst): Promise<Intraday | null> {
    // Nasdaq answers without data for a few shares (BRK.B): the chart then says there is no intraday series.
    const data = JSON.parse(await fetchText(`${API}/quote/${inst.providerId}/chart?assetclass=${assetClass(inst)}`)).data;
    if (!data) return null;
    // The feed stamps points with New York wall-clock time written as if it were UTC.
    // Clocks change at night, so one offset per day holds for the whole session.
    const session: { t: number; price: number }[] = [];
    const premarket: { t: number; price: number }[] = [];
    const offsets = new Map<string, number>();
    for (const p of data.chart ?? []) {
      // A share without trades yet today gets one point of price 0, stamped now.
      if (!(p.y > 0)) continue;
      const wall = new Date(p.x).toISOString();
      const hhmm = wall.slice(11, 16);
      const points = hhmm < US_PREMARKET_OPEN || hhmm > '16:00' ? null : hhmm < '09:30' ? premarket : session;
      if (!points) continue;
      const day = wall.slice(0, 10);
      let offset = offsets.get(day);
      if (offset === undefined) {
        offset = zonedTime(day, '12:00', NEW_YORK).getTime() - Date.parse(`${day}T12:00:00Z`);
        offsets.set(day, offset);
      }
      points.push({ t: Math.floor(p.x / 60000) * 60000 + offset, price: p.y });
    }
    return { candles: bucket(session, 1), prevClose: num(data.previousClose), premarket: bucket(premarket, 1) };
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

  async upcoming(inst): Promise<Upcoming> {
    if (inst.kind !== 'stock') return NO_UPCOMING;
    const id = inst.providerId;
    const [earningsDate, dividends] = await Promise.all([
      tryGet(`/analyst/${id}/earnings-date`, 6 * 3600),
      // Nasdaq has dividend history for its own listings only.
      inst.exchange === 'XNAS' ? tryGet(`/quote/${id}/dividends?assetclass=stocks`, 6 * 3600) : null,
    ]);
    const today = zonedParts(new Date(), NEW_YORK).day;
    return { earnings: parseEarningsDate(earningsDate, today), dividend: parseNextDividend(dividends, today) };
  },
};

export interface ScreenerRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  marketCap: number | null;
}

// Preferred shares, notes, warrants and units share the screener with ordinary shares.
const NOT_A_SHARE = /\d%|preferred (stock|units)|interest in a share|warrants?\b|equity units?|corporate units/i;
const SHARE_CLASS =
  /\s*(\([^)]*\)\s*)?(Class [A-Z] )?(Common (Stock|Shares|Units)|Ordinary Shares?|Capital Stock|(Exchangeable )?Limited Voting Shares|Subordinate Voting Shares|American Deposit[ao]ry Shares|NY Registry Shares|Spons[a-z]* ADR|ADR|ADS|Limited Partnership Units)\b.*$/i;

// "Apple Inc. Common Stock" -> "Apple Inc."
export const companyName = (name: string) => name.replace(SHARE_CLASS, '').trim();

// The stock screener's download: every share of one exchange with its last close, in one call.
// Its prices are a session behind while the market trades.
export function parseUsScreener(json: any): ScreenerRow[] {
  const rows: ScreenerRow[] = [];
  for (const r of json?.data?.rows ?? []) {
    const price = num(r.lastsale);
    if (price === null || NOT_A_SHARE.test(r.name) || !/^[A-Z][A-Z./]*$/.test(r.symbol)) continue;
    rows.push({
      ticker: r.symbol,
      name: companyName(r.name),
      sector: r.sector,
      industry: r.industry,
      price,
      change: num(r.netchange) ?? 0,
      changePct: num(r.pctchange) ?? 0,
      volume: num(r.volume),
      marketCap: num(r.marketCap) || null,
    });
  }
  return rows;
}

// Parsed once a minute per data centre: the quotes, the universe and symbol lookups read it.
export function usScreener(exchange: ExchangeId): Promise<ScreenerRow[]> {
  return shared(`us:screener:${exchange}`, 60, async () => {
    const market = exchange === 'XNAS' ? 'nasdaq' : 'nyse';
    // Large and mega caps only: several hundred rows instead of seven thousand.
    const url = `${API}/screener/stocks?tableonly=true&download=true&limit=5000&marketcap=mega|large&exchange=${market}`;
    // The download is a few hundred kilobytes and can be slow far from the US.
    const rows = parseUsScreener(JSON.parse(await fetchText(url, 'application/json', { timeoutMs: 15000 })));
    if (rows.length === 0) throw new UpstreamError(`Nasdaq screener returned no ${market} shares`);
    return rows;
    // If Nasdaq stops answering, the last list stands in for six hours; the largest shares still get live quotes.
  }, 6 * 3600);
}

export interface WatchlistRow {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
  time: string;
}

// After the close Nasdaq gives the session's date alone, without a time or offset ("Nov 13, 2026"),
// the same for every row: each date is converted once.
const closes = new Map<string, number>();
function closeTime(text: string): number {
  if (!closes.has(text)) {
    if (closes.size > 20) closes.clear();
    closes.set(text, Date.parse(nasdaqTime(text) ?? ''));
  }
  return closes.get(text)!;
}

// Live last-sale quotes of up to 20 shares per call.
export function parseWatchlist(json: any): WatchlistRow[] {
  const rows: WatchlistRow[] = [];
  for (const r of json?.data ?? []) {
    const price = num(r.lastSalePrice);
    const stamp = String(r.lastTradeTimestampDateTime ?? '');
    const time = /[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? Date.parse(stamp) : closeTime(String(r.lastTradeTimestamp ?? ''));
    if (price === null || Number.isNaN(time)) continue;
    rows.push({
      ticker: r.symbol,
      price,
      change: num(r.netChange) ?? 0,
      changePct: num(r.percentageChange) ?? 0,
      volume: num(r.volume),
      time: new Date(time).toISOString(),
    });
  }
  return rows;
}

const WATCHLIST_SIZE = 20;

export async function usWatchlist(tickers: string[]): Promise<WatchlistRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += WATCHLIST_SIZE) chunks.push(tickers.slice(i, i + WATCHLIST_SIZE));
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const query = chunk.map((t) => `symbol=${encodeURIComponent(`${t.toLowerCase()}|stocks`)}`).join('&');
      return parseWatchlist(JSON.parse(await fetchText(`${API}/quote/watchlist?${query}`)));
    }),
  );
  return parts.flat();
}

const roundOrNull = (value: number | null) => (value === null ? null : Math.round(value));

// Groups price ticks into fixed-minute OHLC bars. Sources with one point a minute give o = h = l = c.
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
