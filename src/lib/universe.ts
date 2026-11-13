import { useEffect, useState, useSyncExternalStore } from 'react';
import { findInstrument } from '../../shared/catalog';
import { EXCHANGES, MARKET_EXCHANGES, MARKETS, sessionState } from '../../shared/exchanges';
import type { BulkQuote, Listing, Market, StockSummary } from '../../shared/types';
import { fetchJson } from './api';

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
  listings: Listing[] | undefined;
  stocks: StockSummary[];
  // Markets whose quotes could not be loaded.
  failed: Market[];
  loading: boolean;
  error: boolean;
}

let listings: Promise<Listing[]> | undefined;

// The universe changes rarely, so it is loaded once per visit.
export function loadListings(): Promise<Listing[]> {
  listings ??= Promise.all(
    MARKETS.map((market) => fetchJson<MarketList<Listing>>(`/api/universe?market=${market}`).then((r) => r.items)),
  ).then((parts) => parts.flat());
  listings.catch(() => (listings = undefined));
  return listings;
}

function quoteToSummary(listing: Listing, q: BulkQuote): StockSummary {
  return {
    ...listing, ...q, prevClose: q.price - q.change, open: null, high: null, low: null,
    pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null,
    high52: null, low52: null, return1Y: null, spark: [],
  };
}

// A minute while one of the market's exchanges is open; otherwise until the next opening bell, at most a quarter-hour.
function interval(market: Market): number {
  const now = new Date();
  const sessions = MARKET_EXCHANGES[market].map((id) => sessionState(EXCHANGES[id], now));
  if (sessions.some((s) => s.isOpen)) return OPEN_MS;
  const untilOpen = Math.min(...sessions.map((s) => s.opensAt.getTime() - now.getTime()));
  return Math.max(OPEN_MS, Math.min(CLOSED_MS, untilOpen));
}

// One shared store, so every component reads the same lists and only one timer per market runs.
let state: MarketState = { listings: undefined, stocks: [], failed: [], loading: true, error: false };
const quotes = new Map<Market, { at: number; items: BulkQuote[] }>();
const failed = new Set<Market>();
const timers = new Map<Market, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function publish(loadedListings: Listing[] | undefined, listingError = false) {
  const bySymbol = new Map(MARKETS.flatMap((m) => quotes.get(m)?.items ?? []).map((q) => [q.symbol, q]));
  const stocks = (loadedListings ?? []).flatMap((l) => {
    const q = bySymbol.get(l.symbol);
    return q ? [quoteToSummary(l, q)] : [];
  });
  const settled = MARKETS.every((m) => quotes.has(m) || failed.has(m));
  state = {
    listings: loadedListings,
    stocks,
    failed: MARKETS.filter((m) => failed.has(m)),
    loading: !listingError && (!loadedListings || !settled),
    error: listingError || (settled && stocks.length === 0),
  };
  for (const listener of listeners) listener();
}

function refresh() {
  return loadListings().then(
    (all) => publish(all),
    () => publish(undefined, true),
  );
}

function poll(market: Market) {
  clearTimeout(timers.get(market));
  if (document.visibilityState === 'hidden') {
    timers.delete(market);
    return;
  }
  fetchJson<MarketList<BulkQuote>>(`/api/quotes?market=${market}`)
    .then(
      (list) => {
        quotes.set(market, { at: Date.now(), items: list.items });
        // Part of the market did not answer: its stocks are missing until it does.
        if (list.failed.length > 0) failed.add(market);
        else failed.delete(market);
      },
      () => failed.add(market),
    )
    .then(refresh)
    .finally(() => {
      if (listeners.size === 0 || document.visibilityState === 'hidden') {
        timers.delete(market);
        return;
      }
      timers.set(market, setTimeout(() => poll(market), interval(market)));
    });
}

// Back in view: anything older than its interval is fetched now; the rest keeps its timer.
function onVisibility() {
  if (document.visibilityState === 'hidden') return;
  const now = Date.now();
  for (const market of MARKETS) {
    const age = now - (quotes.get(market)?.at ?? 0);
    if (age >= interval(market) || !timers.has(market)) poll(market);
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
