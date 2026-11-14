import type { Market, Range } from '../../shared/types';

declare global {
  interface Window {
    // Requests started by index.html before the app's code loaded; fetchJson uses each once.
    early?: Map<string, Promise<Response>>;
  }
}

export interface EarlyConfig {
  markets: Market[];
  indexHistory: string;
  chartRanges: Range[];
  defaultRange: Range;
  // The code files of each page loaded on demand, by the first part of its address ("stock", "screener").
  pages: Record<string, string[]>;
}

// The data requests the page at `pathname` always makes, as fetchJson asks for them.
// It runs inline in index.html (see vite.config.ts), so it must not use anything from outside it.
export function earlyPaths(pathname: string, search: string, { markets, indexHistory, chartRanges, defaultRange }: EarlyConfig): string[] {
  const lists = markets.map((m) => `/api/universe?market=${m}`);
  const quotes = markets.map((m) => `/api/quotes?market=${m}`);
  if (pathname === '/') return ['/api/indices', ...lists, ...quotes, indexHistory, '/api/fx', '/data/heatmap.json'];
  if (pathname === '/screener' || pathname === '/portfolio') return [...lists, ...quotes, '/api/fx', '/api/funds'];
  const stock = /^\/stock\/([^/]+)$/.exec(pathname);
  if (!stock) return [];
  const symbol = encodeURIComponent(decodeURIComponent(stock[1]));
  const asked = new URLSearchParams(search).get('range');
  const range = chartRanges.find((r) => r === asked) ?? defaultRange;
  return [`/api/detail?symbol=${symbol}`, `/api/history?symbol=${symbol}&range=${range}`, ...lists, ...quotes];
}

// The code of the page at `pathname`, when it is not part of the main bundle. Inline in index.html too.
export const earlyModules = (pathname: string, { pages }: EarlyConfig): string[] => pages[pathname.split('/')[1]] ?? [];

// Also inline in index.html. Answers nobody has asked for after half a minute are dropped rather than shown late.
export function startEarly(paths: string[], modules: string[]) {
  for (const href of modules) document.head.append(Object.assign(document.createElement('link'), { rel: 'modulepreload', href }));
  const early = new Map(paths.map((path) => [path, fetch(path)]));
  for (const answer of early.values()) answer.catch(() => undefined);
  window.early = early;
  setTimeout(() => early.clear(), 30_000);
}
