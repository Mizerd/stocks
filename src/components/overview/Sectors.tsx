import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { FxRates, Region, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { toEur } from '../../lib/api';
import { direction, useFormat } from '../../lib/format';
import { turnoverEur, type OverviewSector } from '../../lib/market';
import { treemap, type Rect } from '../../lib/treemap';
import { useSettings } from '../../settings';
import { PanelTitle, Seg } from '../ui';

const REGIONS: Region[] = ['US', 'EU', 'BAL'];
const LIMIT = 100;
// Below this width the sectors stack in one column.
const STACK_BELOW = 560;

function tileColours(changePct: number, dark: boolean) {
  const tone = changePct >= 0 ? 'var(--up)' : 'var(--down)';
  const size = Math.abs(changePct);
  // Mixed in sRGB: hue-based spaces drift towards blue and purple in Safari when one side is near black.
  if (size < 0.3) return { background: `color-mix(in srgb, ${tone} 16%, var(--card))`, color: 'var(--ink)' };
  if (size < 0.7) return { background: `color-mix(in srgb, ${tone} 32%, var(--card))`, color: 'var(--ink)' };
  // Solid colour would glare on the dark theme, so it gets a strong tint instead.
  if (dark) return { background: `color-mix(in srgb, ${tone} 55%, var(--card))`, color: 'var(--ink)' };
  return { background: tone, color: 'var(--paper)' };
}

interface Group {
  sector: OverviewSector;
  // Equal-weighted move of every stock of the sector in the region, not only the ones drawn.
  changePct: number;
  tiles: { stock: StockSummary; weight: number }[];
  weight: number;
}

const sectorOf = (s: StockSummary): OverviewSector => (s.sector === 'S' ? 'D' : s.sector!);
const pct = (r: Rect, of: Rect) => ({
  left: `${(r.x / of.w) * 100}%`, top: `${(r.y / of.h) * 100}%`, width: `${(r.w / of.w) * 100}%`, height: `${(r.h / of.h) * 100}%`,
});

// The region's largest stocks by market cap, or its most traded where caps are not published, grouped by sector.
function groupStocks(all: StockSummary[], fx: FxRates | undefined) {
  const capEur = (s: StockSummary) => (s.marketCap === null ? null : toEur(s.marketCap, s.currency, fx) ?? s.marketCap);
  const byCap = all.every((s) => capEur(s) !== null);
  const rank = byCap ? (s: StockSummary) => capEur(s)! : (s: StockSummary) => turnoverEur(s, fx) ?? 0;
  const shown = [...all].sort((a, b) => rank(b) - rank(a)).slice(0, LIMIT);

  const groups = new Map<OverviewSector, Group>();
  for (const stock of shown) {
    const sector = sectorOf(stock);
    const group = groups.get(sector) ?? { sector, changePct: 0, tiles: [], weight: 0 };
    const weight = byCap ? capEur(stock)! : 1;
    group.tiles.push({ stock, weight });
    group.weight += weight;
    groups.set(sector, group);
  }
  for (const group of groups.values()) {
    const moves = all.filter((s) => sectorOf(s) === group.sector).map((s) => s.changePct);
    group.changePct = moves.reduce((a, b) => a + b, 0) / moves.length;
    // Equal tiles read best ordered by the day's move; sized ones must go largest first.
    group.tiles.sort((a, b) => b.weight - a.weight || b.stock.changePct - a.stock.changePct);
  }
  return { byCap, shown: shown.length, groups: [...groups.values()].sort((a, b) => b.weight - a.weight) };
}

// Sector boxes in pixels: a treemap on wide screens, one column on narrow ones.
function groupRects(groups: Group[], width: number, head: number): { rects: Rect[]; height: number } {
  const total = groups.reduce((a, g) => a + g.weight, 0);
  if (width >= STACK_BELOW) {
    const height = Math.round(Math.min(640, Math.max(380, width * 0.5)));
    return { rects: treemap(groups.map((g) => g.weight), width, height), height };
  }
  // About a 60px square per tile, shared out by weight.
  const area = groups.reduce((a, g) => a + g.tiles.length, 0) * 3600;
  let y = 0;
  const rects = groups.map((g) => {
    const h = head + Math.max(56, Math.round(((g.weight / total) * area) / width));
    const rect = { x: 0, y, w: width, h };
    y += h;
    return rect;
  });
  return { rects, height: y };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Sectors({ stocks, fx }: { stocks: StockSummary[]; fx: FxRates | undefined }) {
  const { t } = useT();
  const f = useFormat();
  const { theme } = useSettings();
  const [ref, width] = useWidth();
  const [picked, setPicked] = useState<Region>('US');

  const withSector = stocks.filter((s) => s.sector);
  const available = REGIONS.filter((r) => withSector.some((s) => s.region === r));
  const region = available.includes(picked) ? picked : available[0];
  const inRegion = withSector.filter((s) => s.region === region);
  const { byCap, shown, groups } = groupStocks(inRegion, fx);
  // Sector headings are links, so on phones they get a full finger's height.
  const head = width < STACK_BELOW ? 44 : 24;
  const { rects, height } = groupRects(groups, width, head);
  if (!region) return null;

  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{t('overview.sectors')}</PanelTitle>
        <Seg
          label={t('overview.hmRegion')}
          value={region}
          onChange={setPicked}
          options={REGIONS.map((r) => ({ value: r, label: t(`screener.reg.${r}`), disabled: !available.includes(r) }))}
        />
      </div>
      <p className="pnl-note" style={{ marginBottom: 14 }}>
        {t('overview.sectorsNote')} {t(byCap ? 'overview.hmCap' : 'overview.hmEqual', { n: shown, total: inRegion.length })}
      </p>
      <div ref={ref} className="hmap" style={{ height }}>
        {width > 0 && groups.map((group, i) => {
          const box = rects[i];
          const area = { x: 0, y: 0, w: box.w - 4, h: box.h - head - 4 };
          const tiles = treemap(group.tiles.map((tile) => tile.weight), area.w, area.h);
          const sectors = group.sector === 'D' ? 'D,S' : group.sector;
          return (
            <div key={group.sector} className="hm-group" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
              <Link to={`/screener?sec=${sectors}&reg=${region}`} className="hm-head" style={{ height: head }}>
                <span className="clip">{t(`overview.sec.${group.sector}`)}</span>
                <span className={`num clip ${direction(group.changePct)}`} style={{ flexShrink: 4 }}>{f.pct(group.changePct)}</span>
              </Link>
              <div className="hm-tiles">
                {group.tiles.map(({ stock }, j) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="hm-tile"
                    aria-label={`${stock.name} (${shortSymbol(stock.symbol)}) ${f.pct(stock.changePct)}`}
                    style={{ ...pct(tiles[j], area), ...tileColours(stock.changePct, theme === 'dark') }}
                  >
                    <span className="hm-sym">{shortSymbol(stock.symbol)}</span>
                    <span className="hm-chg num">{f.pct(stock.changePct)}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
