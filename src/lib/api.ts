import { useEffect, useState } from 'react';
import { EXCHANGES, sessionState } from '../../shared/exchanges';
import type { CompanyAbout, FxRates, History, NewsItem, Range, StockDetail, StockSummary } from '../../shared/types';

interface Entry {
  time: number;
  promise: Promise<unknown>;
}

// Shared between components so the same URL is fetched once per minute at most.
const cache = new Map<string, Entry>();
const FRESH_MS = 60_000;

export function fetchJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.time < FRESH_MS) return hit.promise as Promise<T>;
  const promise = fetch(path).then(async (res) => {
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    return res.json() as Promise<T>;
  });
  cache.set(path, { time: Date.now(), promise });
  promise.catch(() => cache.delete(path));
  return promise;
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
function useLoader<T>(key: string | null, load: () => Promise<T>, refreshMs = 0): ApiState<T> {
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
  if (state.key !== key) return { data: undefined, error: undefined, loading: key !== null };
  return state;
}

export function useApi<T>(path: string | null, refreshMs = 0): ApiState<T> {
  return useLoader(path, () => fetchJson<T>(path!), refreshMs);
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

// Histories of several symbols at once, in the order given. Failed ones come back undefined.
export function useHistories(symbols: string[], range: Range) {
  return useLoader(`${symbols.join(',')}|${range}`, () =>
    Promise.all(
      symbols.map((s) =>
        fetchJson<HistoryResult>(historyPath(s, range)).then(
          (h) => (isUnavailable(h) ? undefined : h),
          () => undefined,
        ),
      ),
    ),
  );
}

export function useDetail(symbol: string) {
  return useApi<StockDetail>(`/api/detail?symbol=${encodeURIComponent(symbol)}`, FRESH_MS);
}

export type AboutResult = CompanyAbout | { unavailable: true };

// A short Wikipedia summary of the company, in the reader's language where there is one.
export function useAbout(symbol: string, lang: 'lt' | 'en') {
  return useApi<AboutResult>(`/api/about?symbol=${encodeURIComponent(symbol)}&lang=${lang}`);
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
