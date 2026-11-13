import type { FxRates, Sector, StockSummary } from '../../shared/types';
import { toEur } from './api';
import type { ListEntry, SortKey } from './myList';

// A list entry with both a quantity and a purchase price. Entries without them are only watched.
export type Holding = ListEntry & { quantity: number; buyPrice: number };

export const hasPosition = (entry: ListEntry): entry is Holding => entry.quantity != null && entry.buyPrice != null;

export interface Position {
  holding: Holding;
  stock: StockSummary;
  valueEur: number;
  costEur: number;
  gainEur: number;
  gainPct: number;
  dayEur: number;
  dividendEur: number | null;
  // Share of the whole portfolio, cash included.
  weight: number;
}

export interface Valuation {
  positions: Position[];
  holdingsEur: number;
  totalEur: number;
  costEur: number;
  gainEur: number;
  gainPct: number;
  dayEur: number;
  dayPct: number;
}

// Values every entry that has a position, in euros. Watched entries and ones without a quote
// or an exchange rate are left out.
export function valuePortfolio(entries: ListEntry[], stocks: StockSummary[], fx: FxRates, cashEur = 0): Valuation {
  const positions: Position[] = [];
  for (const holding of entries.filter(hasPosition)) {
    const stock = stocks.find((s) => s.symbol === holding.symbol);
    const valueEur = stock && toEur(holding.quantity * stock.price, stock.currency, fx);
    const costEur = stock && toEur(holding.quantity * holding.buyPrice, stock.currency, fx);
    if (!stock || valueEur == null || costEur == null) continue;
    positions.push({
      holding,
      stock,
      valueEur,
      costEur,
      gainEur: valueEur - costEur,
      gainPct: costEur ? (valueEur / costEur - 1) * 100 : 0,
      dayEur: valueEur - valueEur / (1 + stock.changePct / 100),
      dividendEur: stock.dividend == null ? null : toEur(holding.quantity * stock.dividend, stock.currency, fx),
      weight: 0,
    });
  }
  const sum = (pick: (p: Position) => number) => positions.reduce((total, p) => total + pick(p), 0);
  const holdingsEur = sum((p) => p.valueEur);
  const totalEur = holdingsEur + cashEur;
  const costEur = sum((p) => p.costEur);
  const dayEur = sum((p) => p.dayEur);
  for (const p of positions) p.weight = totalEur ? p.valueEur / totalEur : 0;
  return {
    positions: positions.sort((a, b) => b.valueEur - a.valueEur),
    holdingsEur,
    totalEur,
    costEur,
    gainEur: holdingsEur - costEur,
    gainPct: costEur ? (holdingsEur / costEur - 1) * 100 : 0,
    dayEur,
    dayPct: holdingsEur - dayEur ? (dayEur / (holdingsEur - dayEur)) * 100 : 0,
  };
}

export interface Slice {
  // X is cash, O a stock whose source gives no sector.
  sector: Sector | 'X' | 'O';
  valueEur: number;
  share: number;
}

// Value per sector, largest first, with any cash ("X") last.
export function allocation(valuation: Valuation, cashEur: number): Slice[] {
  const bySector = new Map<Sector | 'O', number>();
  for (const p of valuation.positions) {
    const sector = p.stock.sector ?? 'O';
    bySector.set(sector, (bySector.get(sector) ?? 0) + p.valueEur);
  }
  const slices: Slice[] = [...bySector.entries()]
    .map(([sector, valueEur]) => ({ sector, valueEur, share: valueEur / valuation.totalEur }))
    .sort((a, b) => b.valueEur - a.valueEur);
  if (cashEur > 0) slices.push({ sector: 'X', valueEur: cashEur, share: cashEur / valuation.totalEur });
  return slices;
}

// Percentage return of today's holdings over a set of aligned closes, at today's exchange rates.
export function portfolioReturns(positions: Position[], closes: number[][], fx: FxRates): number[] {
  const length = Math.max(0, ...closes.map((c) => c.length));
  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    let total = 0;
    positions.forEach((p, k) => {
      if (closes[k].length) total += toEur(p.holding.quantity * closes[k][i], p.stock.currency, fx) ?? 0;
    });
    values.push(total);
  }
  return values.map((v) => (v / values[0] - 1) * 100);
}

// One line of the list table: the entry with its quote and, if it has one, its valued position.
export interface Row {
  entry: ListEntry;
  stock?: StockSummary;
  position?: Position;
}

export function listRows(entries: ListEntry[], stocks: StockSummary[], valuation: Valuation): Row[] {
  return entries.map((entry) => ({
    entry,
    stock: stocks.find((s) => s.symbol === entry.symbol),
    position: valuation.positions.find((p) => p.holding === entry),
  }));
}

const SORT_VALUE: Record<Exclude<SortKey, 'symbol'>, (row: Row) => number | undefined> = {
  value: (row) => row.position?.valueEur,
  gain: (row) => row.position?.gainEur,
  gainPct: (row) => row.position?.gainPct,
  day: (row) => row.stock?.changePct,
};

// Largest first (symbols A to Z); rows without the figure go last, in alphabetical order.
export function sortRows(rows: Row[], key: SortKey): Row[] {
  const bySymbol = (a: Row, b: Row) => a.entry.symbol.localeCompare(b.entry.symbol);
  if (key === 'symbol') return [...rows].sort(bySymbol);
  const value = SORT_VALUE[key];
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return x == null && y == null ? bySymbol(a, b) : x == null ? 1 : -1;
    return y - x || bySymbol(a, b);
  });
}
