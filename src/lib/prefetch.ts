import { prefetchStock } from './api';

// Loads a stock page's data once the pointer or a finger has rested on a link to it for `delayMs`:
// one stock at a time, and each stock once per `againMs`. A touch that turns into a scroll cancels it.
export function createPrefetcher(load: (symbol: string) => Promise<unknown>, delayMs = 100, againMs = 5 * 60_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const loaded = new Map<string, number>();
  return {
    rest(symbol: string) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (busy || Date.now() - (loaded.get(symbol) ?? -Infinity) < againMs) return;
        busy = true;
        loaded.set(symbol, Date.now());
        const free = () => (busy = false);
        load(symbol).then(free, free);
      }, delayMs);
    },
    leave() {
      clearTimeout(timer);
    },
  };
}

const prefetcher = createPrefetcher((symbol) => prefetchStock(symbol));

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

// Props for a link to a stock page.
export function prefetchProps(symbol: string) {
  return {
    onPointerEnter: () => saveData() || prefetcher.rest(symbol),
    onPointerLeave: prefetcher.leave,
  };
}
