import type { FxRates, Sector, StockSummary } from '../../shared/types';
import { toEur } from './api';

// The overview groups consumer staples with consumer discretionary, as the design does.
export type OverviewSector = Exclude<Sector, 'S'>;

export interface SectorMove {
  sector: OverviewSector;
  changePct: number;
  count: number;
}

// Equal-weighted average daily move per sector, largest sector first.
export function sectorMoves(stocks: StockSummary[]): SectorMove[] {
  const groups = new Map<OverviewSector, number[]>();
  for (const s of stocks) {
    if (!s.sector) continue;
    const key = s.sector === 'S' ? 'D' : s.sector;
    groups.set(key, [...(groups.get(key) ?? []), s.changePct]);
  }
  return [...groups.entries()]
    .map(([sector, moves]) => ({ sector, count: moves.length, changePct: moves.reduce((a, b) => a + b, 0) / moves.length }))
    .sort((a, b) => b.count - a.count);
}

// 0..100 mood gauge: 60% breadth (advancers minus decliners), 40% average move capped at 2%.
export function barometer(stocks: StockSummary[]): number | null {
  if (stocks.length === 0) return null;
  const up = stocks.filter((s) => s.changePct > 0).length;
  const down = stocks.filter((s) => s.changePct < 0).length;
  const breadth = (up - down) / stocks.length;
  const average = stocks.reduce((sum, s) => sum + s.changePct, 0) / stocks.length;
  const move = Math.max(-1, Math.min(1, average / 2));
  return Math.round(50 + 30 * breadth + 20 * move);
}

// Value traded today in euros, so volumes on different exchanges can be compared.
export function turnoverEur(stock: StockSummary, fx: FxRates | undefined): number | null {
  if (stock.volume == null) return null;
  return toEur(stock.volume * stock.price, stock.currency, fx);
}
