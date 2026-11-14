import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { HeatmapMeta } from '../../../shared/heatmap';
import type { FxRates, Region, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { buildBoard, layoutBoard, STACK_BELOW, useHeatmapMeta, useUsMore, type SizeBy } from '../../lib/heatmap';
import { useFormat } from '../../lib/format';
import { currentStocks } from '../../lib/market';
import { quoteToSummary, useListings } from '../../lib/universe';
import { Loading, PanelTitle, Seg } from '../ui';
import { Board } from './heatmap/Board';
import { Legend } from './heatmap/Legend';

const REGIONS: Region[] = ['US', 'EU', 'BAL'];
const SIZES: SizeBy[] = ['cap', 'traded', 'equal'];
const LIMIT: Record<Region, number> = { US: 500, EU: 300, BAL: Infinity };
const PHONE_LIMIT = 150;
const SIZE_LABEL: Record<SizeBy, string> = { cap: 'sizeCap', traded: 'sizeTraded', equal: 'sizeEqual' };

function remembered<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T;
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts for this visit.
  }
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

// Whether the element is on screen (or about to be).
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '300px 0px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

// stocks: every stock with its latest quote, today's or not.
export function Heatmap({ stocks, fx }: { stocks: StockSummary[]; fx: FxRates | undefined }) {
  const [region, setRegion] = useState(() => remembered<Region>('heatmapRegion', REGIONS, 'US'));
  const [sizeBy, setSizeBy] = useState(() => remembered<SizeBy>('heatmapSize', SIZES, 'cap'));
  const [expanded, setExpanded] = useState(false);
  const section = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const inView = useInView(section);
  const meta = useHeatmapMeta();
  const listings = useListings();
  const more = useUsMore(region === 'US' && (inView || expanded));

  // US ranks 201 to 500 come live from their own request; the main list holds their previous close.
  const current = useMemo(() => {
    const bySymbol = new Map(listings?.map((l) => [l.symbol, l]));
    const live = new Map(more.flatMap((q) => (bySymbol.has(q.symbol) ? [[q.symbol, quoteToSummary(bySymbol.get(q.symbol)!, q)]] : [])));
    return currentStocks(stocks.map((s) => live.get(s.symbol) ?? s), new Date());
  }, [stocks, more, listings]);
  const available = REGIONS.filter((r) => current.some((s) => s.region === r));
  const shown = available.includes(region) ? region : available[0];

  useEffect(() => {
    if (!expanded) return;
    document.body.style.overflow = 'hidden';
    const button = expandButton.current;
    return () => {
      document.body.style.overflow = '';
      button?.focus();
    };
  }, [expanded]);

  if (!shown) return null;
  const panel = (inOverlay: boolean) => (
    <Panel
      stocks={current}
      meta={meta}
      fx={fx}
      region={shown}
      available={available}
      sizeBy={sizeBy}
      onRegion={(r) => {
        remember('heatmapRegion', r);
        setRegion(r);
      }}
      onSize={(s) => {
        remember('heatmapSize', s);
        setSizeBy(s);
      }}
      expanded={inOverlay}
      open={expanded}
      onExpand={setExpanded}
      expandButton={inOverlay ? undefined : expandButton}
    />
  );
  return (
    <>
      <section ref={section} className="pnl" inert={expanded}>{panel(false)}</section>
      {expanded && (
        <div className="hm-full" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && setExpanded(false)}>
          {panel(true)}
        </div>
      )}
    </>
  );
}

interface PanelProps {
  stocks: StockSummary[];
  meta: HeatmapMeta | null | undefined;
  fx: FxRates | undefined;
  region: Region;
  available: Region[];
  sizeBy: SizeBy;
  onRegion(region: Region): void;
  onSize(size: SizeBy): void;
  // This panel is the expanded view; `open`: the expanded view is showing.
  expanded: boolean;
  open: boolean;
  onExpand(open: boolean): void;
  expandButton?: RefObject<HTMLButtonElement | null>;
}

function Panel({ stocks, meta, fx, region, available, sizeBy, onRegion, onSize, expanded, open, onExpand, expandButton }: PanelProps) {
  const { t } = useT();
  const f = useFormat();
  const noteId = useId();
  const [ref, width] = useWidth();
  const close = useRef<HTMLButtonElement>(null);
  const stacked = width < STACK_BELOW;
  const limit = stacked && !expanded ? PHONE_LIMIT : LIMIT[region];
  // Without share counts, Europe and the Baltics fall back to the value traded.
  const size = sizeBy === 'cap' && region !== 'US' && meta === null ? 'traded' : sizeBy;
  const ready = meta !== undefined && (fx !== undefined || size === 'equal');

  const board = useMemo(
    () => buildBoard(stocks.filter((s) => s.region === region), meta ?? null, fx, size, limit),
    [stocks, region, meta, fx, size, limit],
  );
  const height = expanded && !stacked ? Math.max(320, window.innerHeight - 230) : undefined;
  const placed = useMemo(() => layoutBoard(board, width, stacked, height), [board, width, stacked, height]);

  useEffect(() => {
    if (expanded) close.current?.focus();
  }, [expanded]);

  const sharesDays = region === 'EU' ? [meta?.sharesAsOf.nordic, meta?.sharesAsOf.euronext] : [meta?.sharesAsOf.baltic];
  const sharesDay = sharesDays.filter(Boolean).sort()[0];
  const day = (iso: string) => `${iso}T12:00:00Z`;
  const note = [
    board.sessionDay && t('heatmap.session', { d: f.weekdayDate(board.sessionDay) }),
    size === 'equal' ? t('heatmap.noteEqual') : size === 'traded' ? t('heatmap.noteTraded') : region === 'US' ? t('heatmap.noteCapUs') : t('heatmap.noteCap'),
    size === 'cap' && region !== 'US' && sharesDay && t('heatmap.sharesAsOf', { d: f.date(day(sharesDay), 'UTC') }),
    board.shown < board.total && t('heatmap.shown', { n: f.num(board.shown, 0), total: f.num(board.total, 0) }),
    board.unsized > 0 && t('heatmap.unsized', { k: f.num(board.unsized, 0) }),
    placed.tiles.some((p) => p.tier === 'xl' && p.tile.logo) && t('heatmap.logos'),
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className="pnl-head hm-bar">
        <PanelTitle>{t('heatmap.title')}</PanelTitle>
        <div className="hm-controls">
          <Seg
            label={t('heatmap.region')}
            value={region}
            onChange={onRegion}
            options={REGIONS.map((r) => ({ value: r, label: t(`screener.reg.${r}`), disabled: !available.includes(r) }))}
          />
          <Seg label={t('heatmap.size')} value={sizeBy} onChange={onSize} options={SIZES.map((s) => ({ value: s, label: t(`heatmap.${SIZE_LABEL[s]}`) }))} />
        </div>
        {expanded ? (
          <button ref={close} type="button" className="icon-btn" aria-label={t('heatmap.close')} title={t('heatmap.close')} onClick={() => onExpand(false)}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }} />
            </svg>
          </button>
        ) : (
          <button ref={expandButton} type="button" className="icon-btn" aria-label={t('heatmap.expand')} title={t('heatmap.expand')} aria-expanded={open} onClick={() => onExpand(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
            </svg>
          </button>
        )}
      </div>
      <div ref={ref} className="hm-board">
        {!ready ? <Loading height={420} /> : width > 0 && <Board placed={placed} width={width} region={region} noteId={noteId} />}
      </div>
      <Legend />
      <p id={noteId} className="pnl-note">{note}</p>
    </>
  );
}
