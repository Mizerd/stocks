import { useEffect, useState } from 'react';
import { STOCKS } from '../../shared/catalog';
import type { FxRates, History, NewsItem, Range, StockDetail, StockSummary } from '../../shared/types';

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

// Loads `load()` whenever `key` changes and again every `refreshMs`. A null key loads nothing.
function useLoader<T>(key: string | null, load: () => Promise<T>, refreshMs = 0): ApiState<T> {
  const [state, setState] = useState<ApiState<T> & { key: string | null }>({
    key, data: undefined, error: undefined, loading: key !== null,
  });

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    const run = () =>
      load().then(
        (data) => alive && setState({ key, data, error: undefined, loading: false }),
        (error: Error) => alive && setState((old) => ({ key, data: old.key === key ? old.data : undefined, error, loading: false })),
      );
    run();
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
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

// The API takes at most 8 symbols per call, so the catalogue is fetched in chunks.
async function loadStocks(symbols: string[]): Promise<SummaryList> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 8) chunks.push(symbols.slice(i, i + 8));
  const parts = await Promise.all(
    chunks.map((chunk) =>
      fetchJson<SummaryList>(`/api/stocks?symbols=${encodeURIComponent(chunk.join(','))}`).catch(
        (): SummaryList => ({ items: [], failed: chunk }),
      ),
    ),
  );
  const result = { items: parts.flatMap((p) => p.items), failed: parts.flatMap((p) => p.failed) };
  if (result.items.length === 0) throw new Error('No quotes could be loaded');
  return result;
}

const ALL_SYMBOLS = STOCKS.map((s) => s.symbol);

// Every stock in the catalogue (or just `symbols`), refreshed once a minute.
export function useStocks(symbols: string[] = ALL_SYMBOLS) {
  const state = useLoader(symbols.join(','), () => loadStocks(symbols), FRESH_MS);
  return { stocks: state.data?.items ?? [], failed: state.data?.failed ?? [], loading: state.loading, error: state.error };
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
