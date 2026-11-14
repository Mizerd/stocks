import { useEffect, useState } from 'react';
import { EXCHANGES, zonedParts } from '../../shared/exchanges';
import type { HeatmapMeta } from '../../shared/heatmap';
import { icbSector, SECTOR_ICB } from '../../shared/icb';
import type { BulkQuote, FxRates, Market, Region, Sector, StockSummary } from '../../shared/types';
import { fetchJson, toEur } from './api';
import { turnoverEur } from './market';
import { treemap } from './treemap';
import { quoteInterval } from './universe';

const REGION_MARKETS: Record<Region, Market[]> = { US: ['us'], EU: ['nordic', 'euronext'], BAL: ['baltic'] };

// Whether some of the region's stocks are still on their way.
export const regionPending = (region: Region, pending: Market[]) => REGION_MARKETS[region].some((m) => pending.includes(m));

export type Step = 'none' | 'flat' | 'u1' | 'u2' | 'u3' | 'u4' | 'u5' | 'u6' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6';
export type SizeBy = 'cap' | 'traded' | 'equal';
export type Tier = 'xl' | 'l' | 'm' | 's';

// Bin edges of the colour scale in percent, the same for every region and day.
export const EDGES = [0.25, 0.5, 1, 2, 3];

export function colourStep(changePct: number, volume: number | null): Step {
  if (volume === 0) return 'none';
  const move = Math.round(changePct * 100) / 100;
  if (move === 0) return 'flat';
  const level = EDGES.filter((edge) => Math.abs(move) >= edge).length + 1;
  return `${move > 0 ? 'u' : 'd'}${level}` as Step;
}

export interface BoardTile {
  stock: StockSummary;
  weight: number;
  // Market value: USD on the US board, EUR elsewhere.
  value: number | null;
  currency: string;
  traded: number | null;
  industry: string;
  logo?: string;
  logoRatio?: number;
  logoMode?: 'badge';
  step: Step;
}
export interface BoardIndustry { key: string; weight: number; tiles: BoardTile[] }
export interface BoardSector { sector: Sector; weight: number; changePct: number | null; industries: BoardIndustry[] }
export interface Board {
  sectors: BoardSector[];
  shown: number;
  total: number;
  // Left out for want of a size in this mode.
  unsized: number;
  sessionTime: string | null;
  // The session's day at the exchange, e.g. "2026-11-13".
  sessionDay: string | null;
}

const byWeight = <T extends { weight: number }>(a: T, b: T) => b.weight - a.weight;

// stocks: the current-session quotes of one region.
export function buildBoard(stocks: StockSummary[], meta: HeatmapMeta | null, fx: FxRates | undefined, sizeBy: SizeBy, limit: number): Board {
  const candidates = stocks.flatMap((stock) => {
    const info = meta?.stocks[stock.symbol];
    const industry = info?.industry ?? (stock.sector && SECTOR_ICB[stock.sector]);
    if (info?.secondary || !industry) return [];
    const us = stock.region === 'US';
    const value = us ? stock.marketCap : info?.shares ? toEur(info.shares * stock.price, stock.currency, fx) : null;
    const traded = turnoverEur(stock, fx);
    const weight = sizeBy === 'cap' ? value : sizeBy === 'traded' ? traded : 1;
    return [{ stock, value, traded, weight, industry, logo: info?.logo, logoRatio: info?.logoRatio, logoMode: info?.logoMode, currency: us ? 'USD' : 'EUR', rank: value ?? traded ?? 0 }];
  });
  const sized = candidates.filter((c) => c.weight !== null);
  const shown = sized
    .filter((c): c is typeof c & { weight: number } => c.weight! > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  const sectors = new Map<Sector, Map<string, BoardTile[]>>();
  for (const item of shown) {
    const sector = icbSector(item.industry) ?? item.stock.sector!;
    const industries = sectors.get(sector) ?? new Map<string, BoardTile[]>();
    industries.set(item.industry, [...(industries.get(item.industry) ?? []), { ...item, step: colourStep(item.stock.changePct, item.stock.volume) }]);
    sectors.set(sector, industries);
  }
  const total = (tiles: { weight: number }[]) => tiles.reduce((sum, t) => sum + t.weight, 0);
  const boardSectors = [...sectors].map(([sector, groups]): BoardSector => {
    const industries = [...groups].map(([key, tiles]) => ({ key, tiles: tiles.sort(byWeight), weight: total(tiles) })).sort(byWeight);
    const traded = industries.flatMap((i) => i.tiles).filter((t) => t.step !== 'none');
    const changePct = traded.length ? traded.reduce((sum, t) => sum + t.weight * t.stock.changePct, 0) / total(traded) : null;
    return { sector, weight: total(industries), changePct, industries };
  }).sort(byWeight);

  const latest = shown.reduce<StockSummary | null>((max, { stock }) => (!max || stock.time > max.time ? stock : max), null);
  return {
    sectors: boardSectors,
    shown: shown.length,
    total: candidates.length,
    unsized: candidates.length - sized.length,
    sessionTime: latest?.time ?? null,
    sessionDay: latest ? zonedParts(new Date(latest.time), EXCHANGES[latest.exchange].timezone).day : null,
  };
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Placed {
  sectors: (Box & { sector: BoardSector; head: number })[];
  industries: (Box & { industry: BoardIndustry; label: boolean })[];
  tiles: (Box & { tile: BoardTile; tier: Tier })[];
  height: number;
}

// Below this width sectors stack in one column.
export const STACK_BELOW = 560;
const half = (n: number) => Math.round(n * 2) / 2;

function tier(w: number, h: number): Tier {
  if (w >= 110 && h >= 80) return 'xl';
  if (w >= 56 && h >= 34) return 'l';
  if (w >= 30 && h >= 16) return 'm';
  return 's';
}

// treemap() needs a box with room and weights above zero.
function split<T extends { weight: number }>(items: T[], box: Box): (Box & { item: T })[] {
  const kept = items.filter((i) => i.weight > 0 && Number.isFinite(i.weight));
  if (kept.length === 0 || !(box.w > 0 && box.h > 0)) return [];
  return treemap(kept.map((i) => i.weight), box.w, box.h).map((r, i) => ({ x: box.x + r.x, y: box.y + r.y, w: r.w, h: r.h, item: kept[i] }));
}

const inset = (box: Box, by: number): Box => ({ x: box.x + by, y: box.y + by, w: Math.max(0, box.w - 2 * by), h: Math.max(0, box.h - 2 * by) });

// Nested treemap in pixels: sectors, industries within them, then one tile per stock.
// `height` fixes the board height (the expanded view); otherwise it follows the width.
export function layoutBoard(board: Board, width: number, stacked: boolean, height?: number): Placed {
  const placed: Placed = { sectors: [], industries: [], tiles: [], height: 0 };
  if (!(width > 0) || board.sectors.length === 0) return placed;
  const all = board.sectors.reduce((sum, s) => sum + s.weight, 0);
  let sectorBoxes: (Box & { item: BoardSector })[];
  if (stacked) {
    let y = 0;
    sectorBoxes = board.sectors.map((sector) => {
      const h = 44 + Math.max(64, Math.round((sector.weight / all) * width * 1.8));
      const box = { x: 0, y, w: width, h, item: sector };
      y += h;
      return box;
    });
    placed.height = y;
  } else {
    placed.height = Math.round(height ?? Math.min(720, Math.max(420, 0.56 * width)));
    sectorBoxes = split(board.sectors, { x: 0, y: 0, w: width, h: placed.height });
  }

  for (const { item: sector, ...outer } of sectorBoxes) {
    const box = inset(outer, 2);
    const head = box.w < 60 || box.h < 40 ? 0 : stacked ? 44 : 18;
    placed.sectors.push({ ...roundBox(box), sector, head });
    const area = { x: box.x + 1, y: box.y + head + 1, w: box.w - 2, h: box.h - head - 2 };
    for (const { item: industry, ...industryBox } of split(sector.industries, area)) {
      const inner = inset(industryBox, 1);
      const label = sector.industries.length > 1 && inner.w >= 90 && inner.h >= 60;
      placed.industries.push({ ...roundBox(inner), industry, label });
      const tilesArea = { ...inner, y: inner.y + (label ? 14 : 0), h: inner.h - (label ? 14 : 0) };
      for (const { item: tile, ...tileBox } of split(industry.tiles, tilesArea)) {
        placed.tiles.push({ ...roundBox(tileBox), tile, tier: tier(tileBox.w, tileBox.h) });
      }
    }
  }
  return placed;
}

const roundBox = ({ x, y, w, h }: Box): Box => ({ x: half(x), y: half(y), w: half(w), h: half(h) });

let metaRequest: Promise<HeatmapMeta | null> | undefined;

// The heatmap's static data, once per visit: undefined while it loads, null if it is missing.
export function useHeatmapMeta(): HeatmapMeta | null | undefined {
  const [meta, setMeta] = useState<HeatmapMeta | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    metaRequest ??= fetchJson<HeatmapMeta>('/data/heatmap.json').then((m) => (m?.stocks ? m : null), () => null);
    metaRequest.then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}

const US_MORE = '/api/quotes?market=us&part=2';

// Live quotes for US ranks 201 to 500, polled only while `enabled` and the tab is visible.
export function useUsMore(enabled: boolean): BulkQuote[] {
  const [items, setItems] = useState<BulkQuote[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      fetchJson<{ items: BulkQuote[] }>(US_MORE)
        .then((list) => alive && setItems(list.items), () => undefined)
        .finally(() => {
          if (!alive) return;
          clearTimeout(timer);
          timer = setTimeout(load, quoteInterval('us'));
        });
    };
    const onVisibility = () => document.visibilityState === 'visible' && load();
    load();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
  return items;
}
