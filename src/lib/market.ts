import { EXCHANGES, isCurrentQuote, latestSession, sessionState } from '../../shared/exchanges';
import type { ExchangeId, FxRates, Listing, Sector, StockSummary } from '../../shared/types';
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

// True while at least one covered exchange is in session.
export const anyMarketOpen = (now: Date) => Object.values(EXCHANGES).some((ex) => sessionState(ex, now).isOpen);

// Stocks quoted in their exchange's latest session. Others carry an earlier session's close
// (the US list outside its live top), which must not be mixed into today's moves.
// Each exchange's latest session is worked out once, as that takes several time zone conversions.
export function currentStocks(stocks: StockSummary[], now: Date): StockSummary[] {
  const opens = new Map<ExchangeId, number>();
  return stocks.filter((s) => {
    if (!opens.has(s.exchange)) opens.set(s.exchange, latestSession(EXCHANGES[s.exchange], now).opens.getTime());
    return Date.parse(s.time) >= opens.get(s.exchange)!;
  });
}

// Today's move, or null when the quote is from an earlier session.
export const dayMove = (stock: StockSummary, now: Date) =>
  isCurrentQuote(EXCHANGES[stock.exchange], stock.time, now) ? stock.changePct : null;

export type PeerReason = 'sectorExchange' | 'sectorRegion' | 'exchange';
const PEER_ORDER: PeerReason[] = ['sectorExchange', 'sectorRegion', 'exchange'];

export interface Peer {
  stock: StockSummary;
  reason: PeerReason;
}

function peerReason(inst: Listing, s: StockSummary): PeerReason | null {
  if (s.symbol === inst.symbol) return null;
  if (s.sector === inst.sector && s.exchange === inst.exchange) return 'sectorExchange';
  if (s.sector === inst.sector && s.region === inst.region) return 'sectorRegion';
  return s.exchange === inst.exchange ? 'exchange' : null;
}

// Other stocks closest to `inst`: the same sector on the same exchange, then in the same region, then
// anything on the same exchange. Largest first within each, by market value where it is published, else by value traded today.
export function similarStocks(inst: Listing, stocks: StockSummary[], fx: FxRates | undefined, count = 5): Peer[] {
  const size = (s: StockSummary) => (s.marketCap !== null ? toEur(s.marketCap, s.currency, fx) : null) ?? turnoverEur(s, fx) ?? 0;
  return stocks
    .flatMap((stock) => {
      const reason = peerReason(inst, stock);
      return reason ? [{ stock, reason, size: size(stock) }] : [];
    })
    .sort((a, b) => PEER_ORDER.indexOf(a.reason) - PEER_ORDER.indexOf(b.reason) || b.size - a.size)
    .slice(0, count)
    .map(({ stock, reason }) => ({ stock, reason }));
}
