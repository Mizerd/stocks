import { useEffect, useState } from 'react';
import { EXCHANGES, sessionState } from '../../shared/exchanges';
import type { CompanyAbout, FxRates, History, NewsItem, Range, StockDetail, StockSummary, Upcoming } from '../../shared/types';

interface Entry {
  time: number;
  promise: Promise<unknown>;
  // The last answer, and when it was asked for.
  data?: unknown;
  dataTime?: number;
}

// Shared between components so the same URL is fetched once per minute at most.
const cache = new Map<string, Entry>();
const FRESH_MS = 60_000;
// An earlier answer this recent is shown at once while a new one loads.
const SHOW_EARLIER_MS = 15 * 60_000;

function request(path: string): Promise<Response> {
  const early = window.early?.get(path);
  window.early?.delete(path);
  return early ?? fetch(path);
}

export function fetchJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.time < FRESH_MS) return hit.promise as Promise<T>;
  const promise = request(path).then(async (res) => {
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    return res.json() as Promise<T>;
  });
  const entry: Entry = { time: Date.now(), promise, data: hit?.data, dataTime: hit?.dataTime };
  cache.set(path, entry);
  promise.then(
    (data) => Object.assign(entry, { data, dataTime: entry.time }),
    () => cache.get(path) === entry && cache.delete(path),
  );
  return promise;
}

// The last answer for `path`, if it is recent enough to show while a new one loads.
export function earlierJson<T>(path: string): T | undefined {
  const hit = cache.get(path);
  return hit?.dataTime !== undefined && Date.now() - hit.dataTime < SHOW_EARLIER_MS ? (hit.data as T) : undefined;
}

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

const CLOSED_MS = 15 * 60_000;
const anyExchangeOpen = () => Object.values(EXCHANGES).some((ex) => sessionState(ex, new Date()).isOpen);

// Loads `load()` whenever `key` changes and again every `refreshMs`. A null key loads nothing.
// Refreshes pause in a hidden tab (and catch up when it is shown) and slow to a quarter-hour while every exchange is closed.
// `earlier` is shown while the first load for a key runs.
function useLoader<T>(key: string | null, load: () => Promise<T>, refreshMs = 0, earlier?: T): ApiState<T> {
  const [state, setState] = useState<ApiState<T> & { key: string | null }>({
    key, data: undefined, error: undefined, loading: key !== null,
  });

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    let lastRun = 0;
    const run = () => {
      lastRun = Date.now();
      load().then(
        (data) => alive && setState({ key, data, error: undefined, loading: false }),
        (error: Error) => alive && setState((old) => ({ key, data: old.key === key ? old.data : undefined, error, loading: false })),
      );
    };
    const due = () => {
      const wait = Math.max(refreshMs, anyExchangeOpen() ? 0 : CLOSED_MS);
      if (document.visibilityState === 'visible' && Date.now() - lastRun >= wait - 1000) run();
    };
    run();
    const timer = refreshMs ? setInterval(due, refreshMs) : undefined;
    if (refreshMs) document.addEventListener('visibilitychange', due);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', due);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs]);

  // While a new key loads, don't show the previous key's data.
  if (state.key !== key) return { data: earlier, error: undefined, loading: key !== null };
  return state.data === undefined && state.loading ? { ...state, data: earlier } : state;
}

export function useApi<T>(path: string | null, refreshMs = 0): ApiState<T> {
  return useLoader(path, () => fetchJson<T>(path!), refreshMs, path === null ? undefined : earlierJson<T>(path));
}

interface SummaryList {
  items: StockSummary[];
  failed: string[];
}

const HISTORY_MS = 15 * 60_000;
const BATCH = 6;

// Figures that need a stock's own history or fundamentals, which the bulk quote lists do not carry.
// Whichever of the two quotes is newer is shown.
export function withHistory(stock: StockSummary, full: StockSummary | undefined): StockSummary {
  if (!full) return stock;
  const { pe, eps, dividend, dividendYield, avgVolume, high52, low52, return1Y, spark } = full;
  const merged = { ...stock, pe, eps, dividend, dividendYield, avgVolume, high52, low52, return1Y, spark, marketCap: stock.marketCap ?? full.marketCap };
  if (full.time <= stock.time) return merged;
  const { price, change, changePct, prevClose, open, high, low, volume, time, freshness } = full;
  return { ...merged, price, change, changePct, prevClose, open, high, low, volume, time, freshness };
}

const summaries = new Map<string, { at: number; summary: StockSummary | undefined }>();

// Full summaries of the stocks on screen, one request each so the edge cache serves every visitor the
// same answers. Live prices come from the bulk quotes; these only add the slower figures, so each is
// refreshed once a quarter-hour. Kept across pages, so scrolling back or paging on reuses them.
export function useSummaries(symbols: string[]): ReadonlyMap<string, StockSummary> {
  const [, setVersion] = useState(0);
  const key = symbols.join(',');
  useEffect(() => {
    let alive = true;
    const load = (symbol: string) =>
      fetchJson<SummaryList>(`/api/stocks?symbols=${encodeURIComponent(symbol)}`).then(
        (r) => summaries.set(symbol, { at: Date.now(), summary: r.items[0] }),
        () => summaries.delete(symbol),
      );
    const run = async () => {
      if (document.visibilityState === 'hidden') return;
      const due = symbols.filter((s) => Date.now() - (summaries.get(s)?.at ?? 0) > HISTORY_MS);
      // A few at a time, so a page of new rows does not fire dozens of requests at once; rows fill in as they arrive.
      for (let i = 0; i < due.length && alive; i += BATCH) {
        const batch = due.slice(i, i + BATCH).filter((s) => Date.now() - (summaries.get(s)?.at ?? 0) > HISTORY_MS);
        // Marked before the answer arrives, so another component or re-render does not ask twice.
        for (const s of batch) summaries.set(s, { at: Date.now(), summary: summaries.get(s)?.summary });
        await Promise.all(batch.map(load));
        if (alive) setVersion((v) => v + 1);
      }
    };
    run();
    const timer = setInterval(run, FRESH_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return new Map(symbols.flatMap((s) => {
    const summary = summaries.get(s)?.summary;
    return summary ? [[s, summary] as const] : [];
  }));
}

export function useIndices() {
  const state = useApi<SummaryList>('/api/indices', FRESH_MS);
  return { indices: state.data?.items ?? [], loading: state.loading, error: state.error };
}

export type HistoryResult = History | { unavailable: true };

export const isUnavailable = (h: HistoryResult | undefined): h is { unavailable: true } =>
  h !== undefined && 'unavailable' in h;

export const historyPath = (symbol: string, range: Range) =>
  `/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`;

export function useHistory(symbol: string | null, range: Range) {
  return useApi<HistoryResult>(symbol ? historyPath(symbol, range) : null, range === '1D' ? 120_000 : 0);
}

const available = (h: HistoryResult | undefined) => (h && !isUnavailable(h) ? h : undefined);

// Histories of several symbols at once, in the order given. Failed ones come back undefined.
export function useHistories(symbols: string[], range: Range) {
  const paths = symbols.map((s) => historyPath(s, range));
  const earlier = paths.map((path) => earlierJson<HistoryResult>(path));
  return useLoader(
    `${symbols.join(',')}|${range}`,
    () => Promise.all(paths.map((path) => fetchJson<HistoryResult>(path).then(available, () => undefined))),
    0,
    earlier.every(Boolean) ? earlier.map(available) : undefined,
  );
}

export const detailPath = (symbol: string) => `/api/detail?symbol=${encodeURIComponent(symbol)}`;

export function useDetail(symbol: string) {
  return useApi<StockDetail>(detailPath(symbol), FRESH_MS);
}

// The stock chart's ranges, and its range when the page address names none.
export const CHART_RANGES: Range[] = ['1D', '5D', '1M', '6M', '1Y', '5Y'];
export const DEFAULT_RANGE: Range = '1D';

export const chartRange = (params: URLSearchParams): Range => CHART_RANGES.find((r) => r === params.get('range')) ?? DEFAULT_RANGE;

// Loads what a stock page shows first, ahead of the page or alongside the universe list it waits for.
export function prefetchStock(symbol: string, range = DEFAULT_RANGE): Promise<unknown> {
  return Promise.all([fetchJson(detailPath(symbol)), fetchJson(historyPath(symbol, range))]).catch(() => undefined);
}

export const upcomingPath = (symbol: string) => `/api/upcoming?symbol=${encodeURIComponent(symbol)}`;

// Next earnings and dividend dates; a request of its own so the main stock request stays light.
export function useUpcoming(symbol: string) {
  return useApi<Upcoming>(upcomingPath(symbol));
}

export type AboutResult = CompanyAbout | { unavailable: true };

export const aboutPath = (symbol: string, lang: 'lt' | 'en') => `/api/about?symbol=${encodeURIComponent(symbol)}&lang=${lang}`;

// A short Wikipedia summary of the company, in the reader's language where there is one.
export function useAbout(symbol: string, lang: 'lt' | 'en') {
  return useApi<AboutResult>(aboutPath(symbol, lang));
}

export function useNews(lang: 'lt' | 'en') {
  return useApi<NewsItem[]>(`/api/news?lang=${lang}`, 5 * FRESH_MS);
}

export function useFx() {
  return useApi<FxRates>('/api/fx');
}

// Converts an amount in `currency` to euros with ECB reference rates.
export function toEur(amount: number, currency: string, fx: FxRates | undefined): number | null {
  const rate = fx?.perEur[currency];
  return rate ? amount / rate : null;
}
