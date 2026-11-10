import type { FxRates, Sector, StockSummary } from '../../shared/types';
import { toEur } from './api';

export interface Holding {
  symbol: string;
  quantity: number;
  avgCost: number;
}

export type AlertType = 'priceAbove' | 'priceBelow' | 'dailyMove';

export interface SampleAlert {
  symbol: string;
  type: AlertType;
  value: number;
  paused?: boolean;
}

// An invented example portfolio. Quantities, purchase prices and alert levels are made up;
// everything computed from them uses real quotes.
export const SAMPLE_PORTFOLIO = {
  cashEur: 1250,
  benchmark: 'NDX',
  holdings: [
    { symbol: 'AAPL', quantity: 40, avgCost: 262.4 },
    { symbol: 'NVDA', quantity: 60, avgCost: 188.2 },
    { symbol: 'MSFT', quantity: 18, avgCost: 452.5 },
    { symbol: 'ASML.AS', quantity: 6, avgCost: 905 },
    { symbol: 'KO', quantity: 80, avgCost: 74.1 },
    { symbol: 'JNJ', quantity: 25, avgCost: 214.6 },
    { symbol: 'NOVO-B.CO', quantity: 45, avgCost: 312 },
    { symbol: 'IGN1L.VS', quantity: 300, avgCost: 20.9 },
    { symbol: 'TEL1L.VS', quantity: 1500, avgCost: 1.92 },
  ] as Holding[],
  alerts: [
    { symbol: 'AAPL', type: 'priceAbove', value: 360 },
    { symbol: 'NVDA', type: 'priceBelow', value: 160 },
    { symbol: 'TSLA', type: 'dailyMove', value: 5 },
    { symbol: 'NOVO-B.CO', type: 'priceAbove', value: 300, paused: true },
    { symbol: 'MSFT', type: 'priceAbove', value: 525 },
  ] as SampleAlert[],
};

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

// Values every holding in euros. Holdings without a quote or an exchange rate are left out.
export function valuePortfolio(holdings: Holding[], stocks: StockSummary[], fx: FxRates, cashEur: number): Valuation {
  const positions: Position[] = [];
  for (const holding of holdings) {
    const stock = stocks.find((s) => s.symbol === holding.symbol);
    const valueEur = stock && toEur(holding.quantity * stock.price, stock.currency, fx);
    const costEur = stock && toEur(holding.quantity * holding.avgCost, stock.currency, fx);
    if (!stock || valueEur == null || costEur == null) continue;
    positions.push({
      holding,
      stock,
      valueEur,
      costEur,
      gainEur: valueEur - costEur,
      gainPct: (valueEur / costEur - 1) * 100,
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
  for (const p of positions) p.weight = p.valueEur / totalEur;
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
  sector: Sector | 'X';
  valueEur: number;
  share: number;
}

// Value per sector, largest first, with cash ("X") last.
export function allocation(valuation: Valuation, cashEur: number): Slice[] {
  const bySector = new Map<Sector, number>();
  for (const p of valuation.positions) {
    const sector = p.stock.sector!;
    bySector.set(sector, (bySector.get(sector) ?? 0) + p.valueEur);
  }
  const slices: Slice[] = [...bySector.entries()]
    .map(([sector, valueEur]) => ({ sector, valueEur, share: valueEur / valuation.totalEur }))
    .sort((a, b) => b.valueEur - a.valueEur);
  slices.push({ sector: 'X', valueEur: cashEur, share: cashEur / valuation.totalEur });
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

export interface AlertState {
  status: 'active' | 'paused' | 'reached';
  // 0..1: how close the price is to the alert level.
  proximity: number;
  // Percent the price still has to move; for a daily-move alert, today's move.
  distancePct: number;
}

export function alertState(alert: SampleAlert, stock: StockSummary): AlertState {
  let reached: boolean;
  let proximity: number;
  let distancePct: number;
  if (alert.type === 'dailyMove') {
    distancePct = stock.changePct;
    reached = Math.abs(stock.changePct) >= alert.value;
    proximity = Math.abs(stock.changePct) / alert.value;
  } else {
    distancePct = (alert.value / stock.price - 1) * 100;
    reached = alert.type === 'priceAbove' ? stock.price >= alert.value : stock.price <= alert.value;
    // The bar starts filling once the price is within 12.5% of the level.
    proximity = 1 - Math.abs(distancePct) / 12.5;
  }
  return {
    status: alert.paused ? 'paused' : reached ? 'reached' : 'active',
    proximity: reached ? 1 : Math.max(0, Math.min(1, proximity)),
    distancePct,
  };
}
