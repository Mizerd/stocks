import { useEffect, useState, useSyncExternalStore } from 'react';
import { findInstrument } from '../../shared/catalog';
import { EXCHANGES, MARKET_EXCHANGES, MARKETS, sessionState } from '../../shared/exchanges';
import type { BulkQuote, Listing, Market, StockSummary } from '../../shared/types';
import { fetchJson } from './api';
import { loadFunds } from './funds';

// Every covered stock (from /api/universe) and their latest prices (from /api/quotes), one request
// per market. Quotes refresh every minute while one of the market's exchanges is open, less often
// while they are closed, not at all in a hidden tab, and at once when the tab is shown again.

const OPEN_MS = 60_000;
const CLOSED_MS = 15 * 60_000;

interface MarketList<T> {
  items: T[];
  failed: string[];
}

export interface MarketState {
  stocks: StockSummary[];
  // Markets whose list or quotes could not be loaded.
  failed: Market[];
  // Markets whose list or quotes have not arrived yet.
  pending: Market[];
  // Some market is still pending.
  loading: boolean;
  error: boolean;
}

// Each market's stock list, once loaded. The universe changes rarely, so a list is loaded once per visit.
const lists = new Map<Market, Listing[]>();
const listRequests = new Map<Market, Promise<Listing[]>>();
// Markets whose stock list did not load; the others still show, and the next refresh tries again.
const missingLists = new Set<Market>();

function loadMarketList(market: Market): Promise<Listing[]> {
  let request = listRequests.get(market);
  if (!request) {
    request = fetchJson<MarketList<Listing>>(`/api/universe?market=${market}`).then(
      (r) => {
        missingLists.delete(market);
        lists.set(market, r.items);
        return r.items;
      },
      () => {
        missingLists.add(market);
        listRequests.delete(market);
        return [];
      },
    );
    listRequests.set(market, request);
  }
  return request;
}

// Every stock and fund. Funds are part of it; a fund list that fails to load leaves the stocks searchable.
export function loadListings(): Promise<Listing[]> {
  return Promise.all([...MARKETS.map(loadMarketList), loadFunds().catch(() => [] as Listing[])]).then((parts) => {
    if (missingLists.size === MARKETS.length) throw new Error('No market list loaded');
    return parts.flat();
  });
}

export function quoteToSummary(listing: Listing, q: BulkQuote): StockSummary {
  return {
    ...listing, ...q, prevClose: q.price - q.change, open: null, high: null, low: null,
    pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null,
    high52: null, low52: null, return1Y: null, spark: [],
  };
}

// A minute while one of the market's exchanges is open; otherwise until the next opening bell, at most a quarter-hour.
export function quoteInterval(market: Market): number {
  const now = new Date();
  const sessions = MARKET_EXCHANGES[market].map((id) => sessionState(EXCHANGES[id], now));
  if (sessions.some((s) => s.isOpen)) return OPEN_MS;
  const untilOpen = Math.min(...sessions.map((s) => s.opensAt.getTime() - now.getTime()));
  return Math.max(OPEN_MS, Math.min(CLOSED_MS, untilOpen));
}

// One shared store, so every component reads the same lists and only one timer per market runs.
// A market that failed is asked again soon rather than at its normal pace.
const RETRY_MS = 20_000;

let state: MarketState = { stocks: [], failed: [], pending: [...MARKETS], loading: true, error: false };
const quotes = new Map<Market, { at: number; items: BulkQuote[] }>();
const failed = new Set<Market>();
const timers = new Map<Market, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

// Markets that failed, and those still waiting for their list or quotes.
export function marketProgress(listed: Market[], quoted: Market[], broken: Market[]): { failed: Market[]; pending: Market[] } {
  return {
    failed: MARKETS.filter((m) => broken.includes(m)),
    pending: MARKETS.filter((m) => !broken.includes(m) && !(listed.includes(m) && quoted.includes(m))),
  };
}

// Each market shows as soon as its own list and quotes are in.
function publish() {
  const stocks = MARKETS.flatMap((m) => {
    const bySymbol = new Map(quotes.get(m)?.items.map((q) => [q.symbol, q]));
    return (lists.get(m) ?? []).flatMap((l) => {
      const q = bySymbol.get(l.symbol);
      return q ? [quoteToSummary(l, q)] : [];
    });
  });
  const progress = marketProgress([...lists.keys()], [...quotes.keys()], [...failed, ...missingLists]);
  state = { stocks, ...progress, loading: progress.pending.length > 0, error: progress.pending.length === 0 && stocks.length === 0 };
  for (const listener of listeners) listener();
}

function poll(market: Market) {
  clearTimeout(timers.get(market));
  if (document.visibilityState === 'hidden') {
    timers.delete(market);
    return;
  }
  const quoted = fetchJson<MarketList<BulkQuote>>(`/api/quotes?market=${market}`).then(
    (list) => {
      quotes.set(market, { at: Date.now(), items: list.items });
      // Part of the market did not answer: its stocks are missing until it does.
      if (list.failed.length > 0) failed.add(market);
      else failed.delete(market);
    },
    () => failed.add(market),
  );
  Promise.all([loadMarketList(market), quoted])
    .then(publish)
    .finally(() => {
      if (listeners.size === 0 || document.visibilityState === 'hidden') {
        timers.delete(market);
        return;
      }
      const missing = failed.has(market) || missingLists.has(market);
      timers.set(market, setTimeout(() => poll(market), missing ? RETRY_MS : quoteInterval(market)));
    });
}

// Back in view: anything older than its interval is fetched now; the rest keeps its timer.
function onVisibility() {
  if (document.visibilityState === 'hidden') return;
  const now = Date.now();
  for (const market of MARKETS) {
    const age = now - (quotes.get(market)?.at ?? 0);
    if (age >= quoteInterval(market) || !timers.has(market)) poll(market);
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener('visibilitychange', onVisibility);
    for (const market of MARKETS) poll(market);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    document.removeEventListener('visibilitychange', onVisibility);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}

// "Nasdaq, NYSE": the exchanges of a market, as named on the page.
export const marketName = (market: Market) => MARKET_EXCHANGES[market].map((id) => EXCHANGES[id].short).join(', ');

export function useMarket(): MarketState {
  return useSyncExternalStore(subscribe, () => state);
}

// The quotes loaded so far, read without starting to load or refresh them.
export const loadedStocks = () => state.stocks;

// The universe alone, for search and symbol checks; null while it loads.
export function useListings(): Listing[] | null {
  const [all, setAll] = useState<Listing[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadListings().then((loaded) => alive && setAll(loaded), () => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, []);
  return all;
}

// A catalogue stock at once, or any stock of the universe once it has loaded.
export function useInstrument(symbol: string): { listing: Listing | undefined; loading: boolean } {
  const known = findInstrument(symbol);
  const all = useListings();
  if (known) return { listing: known, loading: false };
  return { listing: all ? findInstrument(symbol, all) : undefined, loading: all === null };
}
