import { findInstrument } from '../../shared/catalog';
import type { FxRates, History, Region, Sector, StockSummary } from '../../shared/types';
import { toEur } from './api';
import { returnsPct } from './indicators';
import { alignCloses } from './series';

export const SECTORS: Sector[] = ['T', 'C', 'D', 'S', 'F', 'E', 'H', 'U', 'I', 'M'];
export const REGIONS: Region[] = ['US', 'EU', 'BAL'];
export const DIRECTIONS = ['all', 'up', 'down'] as const;
export const COMPARE_RANGES = ['1M', '6M', '1Y', '5Y'] as const;
export const SORT_KEYS = ['symbol', 'name', 'sector', 'price', 'day', 'cap', 'pe', 'dy', 'ret'] as const;

export type Direction = (typeof DIRECTIONS)[number];
export type CompareRange = (typeof COMPARE_RANGES)[number];
export type SortKey = (typeof SORT_KEYS)[number];

export const MAX_PICKS = 4;
export const CAP_MAX = 3000;
// The P/E slider at its right end means "no limit".
export const PE_NO_LIMIT = 100;
export const PE_MIN = 5;
export const DY_MAX = 6;

export interface Filters {
  query: string;
  sectors: Sector[];
  regions: Region[];
  // Billions of euros.
  capMin: number;
  peMax: number;
  dyMin: number;
  direction: Direction;
}

export interface ScreenerState extends Filters {
  sort: SortKey;
  desc: boolean;
  picks: string[];
  range: CompareRange;
}

export const NO_FILTERS: Filters = {
  query: '', sectors: [], regions: [], capMin: 0, peMax: PE_NO_LIMIT, dyMin: 0, direction: 'all',
};

const DEFAULT_PICKS = ['AAPL', 'ASML.AS', 'IGN1L.VS'];

const DEFAULTS: ScreenerState = { ...NO_FILTERS, sort: 'cap', desc: true, picks: DEFAULT_PICKS, range: '1Y' };

export function capEur(stock: StockSummary, fx: FxRates | undefined): number | null {
  return stock.marketCap === null ? null : toEur(stock.marketCap, stock.currency, fx);
}

// A limit that is set leaves out stocks whose figure is unknown.
export function filterStocks(stocks: StockSummary[], filters: Filters, fx: FxRates | undefined): StockSummary[] {
  const query = filters.query.trim().toLowerCase();
  return stocks.filter((stock) => {
    if (query && !stock.symbol.toLowerCase().includes(query) && !stock.name.toLowerCase().includes(query)) return false;
    if (filters.sectors.length > 0 && !(stock.sector && filters.sectors.includes(stock.sector))) return false;
    if (filters.regions.length > 0 && !filters.regions.includes(stock.region)) return false;
    if (filters.capMin > 0) {
      const cap = capEur(stock, fx);
      if (cap === null || cap < filters.capMin * 1e9) return false;
    }
    if (filters.peMax < PE_NO_LIMIT && (stock.pe === null || stock.pe > filters.peMax)) return false;
    if (filters.dyMin > 0 && (stock.dividendYield === null || stock.dividendYield < filters.dyMin)) return false;
    if (filters.direction === 'up' && !(stock.changePct > 0)) return false;
    if (filters.direction === 'down' && !(stock.changePct < 0)) return false;
    return true;
  });
}

interface SortOptions {
  sort: SortKey;
  desc: boolean;
  fx: FxRates | undefined;
  sectorName(sector: Sector): string;
  locale: string;
}

function sortValue(stock: StockSummary, { sort, fx, sectorName }: SortOptions): string | number | null {
  switch (sort) {
    case 'symbol': return stock.symbol;
    case 'name': return stock.name;
    case 'sector': return stock.sector ? sectorName(stock.sector) : null;
    case 'price': return stock.price;
    case 'day': return stock.changePct;
    case 'cap': return capEur(stock, fx);
    case 'pe': return stock.pe;
    case 'dy': return stock.dividendYield;
    case 'ret': return stock.return1Y;
  }
}

// Unknown values go last whichever way the column is sorted.
export function sortStocks(stocks: StockSummary[], options: SortOptions): StockSummary[] {
  const sign = options.desc ? -1 : 1;
  return [...stocks].sort((a, b) => {
    const x = sortValue(a, options);
    const y = sortValue(b, options);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (typeof x === 'string') return sign * x.localeCompare(String(y), options.locale);
    return sign * (x - Number(y));
  });
}

function listParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T[] {
  const given = (params.get(name) ?? '').split(',');
  return allowed.filter((value) => given.includes(value));
}

function choiceParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((value) => value === params.get(name)) ?? fallback;
}

function numberParam(params: URLSearchParams, name: string, min: number, max: number, fallback: number): number {
  const value = Number(params.get(name) ?? NaN);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

// ?pick=AAPL&pick=MSFT and ?pick=AAPL,MSFT both work; ?pick=none means the user cleared the defaults.
function picksParam(params: URLSearchParams): string[] {
  if (!params.has('pick')) return DEFAULT_PICKS;
  const symbols = params
    .getAll('pick')
    .flatMap((value) => value.split(','))
    .map((value) => findInstrument(value))
    .filter((inst) => inst?.kind === 'stock')
    .map((inst) => inst!.symbol);
  return [...new Set(symbols)].slice(0, MAX_PICKS);
}

export function parseState(params: URLSearchParams): ScreenerState {
  return {
    query: params.get('q') ?? '',
    sectors: listParam(params, 'sec', SECTORS),
    regions: listParam(params, 'reg', REGIONS),
    capMin: numberParam(params, 'cap', 0, CAP_MAX, DEFAULTS.capMin),
    peMax: numberParam(params, 'pe', PE_MIN, PE_NO_LIMIT, DEFAULTS.peMax),
    dyMin: numberParam(params, 'dy', 0, DY_MAX, DEFAULTS.dyMin),
    direction: choiceParam(params, 'dir', DIRECTIONS, DEFAULTS.direction),
    sort: choiceParam(params, 'sort', SORT_KEYS, DEFAULTS.sort),
    desc: params.get('order') !== 'asc',
    picks: picksParam(params),
    range: choiceParam(params, 'range', COMPARE_RANGES, DEFAULTS.range),
  };
}

// Only what differs from the defaults goes into the URL.
export function toSearchParams(state: ScreenerState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.sectors.length > 0) params.set('sec', state.sectors.join(','));
  if (state.regions.length > 0) params.set('reg', state.regions.join(','));
  if (state.capMin !== DEFAULTS.capMin) params.set('cap', String(state.capMin));
  if (state.peMax !== DEFAULTS.peMax) params.set('pe', String(state.peMax));
  if (state.dyMin !== DEFAULTS.dyMin) params.set('dy', String(state.dyMin));
  if (state.direction !== DEFAULTS.direction) params.set('dir', state.direction);
  if (state.sort !== DEFAULTS.sort) params.set('sort', state.sort);
  if (!state.desc) params.set('order', 'asc');
  if (state.picks.join(',') !== DEFAULT_PICKS.join(',')) params.set('pick', state.picks.join(',') || 'none');
  if (state.range !== DEFAULTS.range) params.set('range', state.range);
  return params;
}

export interface AlignedReturns {
  times: number[];
  // One list per history, in percent since the first shared date; all null for a missing history.
  returns: (number | null)[][];
}

// Percent return of each history since the first date they all share.
export function alignReturns(histories: (History | undefined)[]): AlignedReturns {
  const { times, closes } = alignCloses(histories);
  return { times, returns: closes.map((list) => (list.length ? returnsPct(list) : times.map(() => null))) };
}
