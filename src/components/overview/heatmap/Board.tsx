import { memo, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../../shared/catalog';
import type { Region } from '../../../../shared/types';
import { useT } from '../../../i18n';
import type { Placed } from '../../../lib/heatmap';
import { direction, useFormat } from '../../../lib/format';
import { Card, industryLabel, Logo } from './Card';

interface Active {
  symbol: string;
  // How the tile was picked: a hover card follows the mouse, a tapped one stays until dismissed.
  mode: 'hover' | 'focus' | 'tap';
}

interface Props {
  placed: Placed;
  width: number;
  region: Region;
  noteId: string;
}

const NAV_KEYS: Record<string, (i: number, last: number) => number> = {
  ArrowRight: (i, last) => Math.min(last, i + 1),
  ArrowDown: (i, last) => Math.min(last, i + 1),
  ArrowLeft: (i) => Math.max(0, i - 1),
  ArrowUp: (i) => Math.max(0, i - 1),
  Home: () => 0,
  End: (_, last) => last,
};

const tileOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.hm-tile') : null);

export function Board({ placed, width, region, noteId }: Props) {
  const { t } = useT();
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef('mouse');
  const [active, setActive] = useState<Active | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const index = (symbol: string | null | undefined) => placed.tiles.findIndex((p) => p.tile.stock.symbol === symbol);
  const shown = active ? placed.tiles[index(active.symbol)] : undefined;
  const tabStop = Math.max(0, index(focused));

  // The last kind of input, so focus from the keyboard shows the card and a tap can pin it.
  useEffect(() => {
    const keyboard = () => (pointer.current = 'keyboard');
    document.addEventListener('keydown', keyboard, true);
    return () => document.removeEventListener('keydown', keyboard, true);
  }, []);

  // A pinned card closes on a tap elsewhere or Esc.
  useEffect(() => {
    if (active?.mode !== 'tap') return;
    const outside = (e: Event) => !root.current?.contains(e.target as Node) && setActive(null);
    const escape = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setActive(null);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [active?.mode]);

  function onPointerDown(e: PointerEvent) {
    pointer.current = e.pointerType;
    if (!tileOf(e.target) && !(e.target as Element).closest('.hm-card')) setActive(null);
  }

  function onPointerOver(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const symbol = tileOf(e.target)?.dataset.sym;
    if (symbol) {
      if (active?.symbol !== symbol || active.mode !== 'hover') setActive({ symbol, mode: 'hover' });
    } else if (active?.mode === 'hover') {
      setActive(null);
    }
  }

  // In the capture phase, so a first tap is stopped before the link itself navigates.
  function onClickCapture(e: MouseEvent) {
    const symbol = tileOf(e.target)?.dataset.sym;
    if (!symbol || (pointer.current !== 'touch' && pointer.current !== 'pen')) return;
    // First tap shows the card; a second tap on the same tile follows the link.
    if (active?.mode !== 'tap' || active.symbol !== symbol) {
      e.preventDefault();
      setActive({ symbol, mode: 'tap' });
    }
  }

  function onFocus(e: FocusEvent) {
    const symbol = tileOf(e.target)?.dataset.sym;
    if (!symbol) return;
    setFocused(symbol);
    if (pointer.current === 'keyboard') setActive({ symbol, mode: 'focus' });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && active) {
      e.stopPropagation();
      setActive(null);
      return;
    }
    const move = NAV_KEYS[e.key];
    const at = index(tileOf(e.target)?.dataset.sym);
    if (!move || at < 0) return;
    e.preventDefault();
    root.current?.querySelectorAll<HTMLElement>('.hm-tile')[move(at, placed.tiles.length - 1)]?.focus();
  }

  return (
    <div
      ref={root}
      className="hmap"
      style={{ height: placed.height }}
      role="group"
      aria-label={t('heatmap.boardAria', { n: placed.tiles.length, region: t(`screener.reg.${region}`) })}
      aria-describedby={noteId}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerLeave={() => active?.mode === 'hover' && setActive(null)}
      onClickCapture={onClickCapture}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <Tiles placed={placed} region={region} tabStop={tabStop} />
      {shown && active?.mode === 'hover' && (
        <div role="tooltip">
          <Card tile={shown.tile} box={shown} width={width} height={placed.height} pinned={false} />
        </div>
      )}
      <div aria-live="polite">
        {shown && active?.mode !== 'hover' && <Card tile={shown.tile} box={shown} width={width} height={placed.height} pinned={active?.mode === 'tap'} />}
      </div>
    </div>
  );
}

// Whether a ticker fits a small tile at the smallest type size (8 px); long Nordic ones often do not.
const symbolFits = (sym: string, width: number) => width >= sym.length * 6.2 + 6;

const at = (box: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: box.x, top: box.y, width: box.w, height: box.h });

// The board itself, redrawn only when the layout or the tab stop changes, not when a card opens.
const Tiles = memo(function Tiles({ placed, region, tabStop }: { placed: Placed; region: Region; tabStop: number }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <>
      {placed.sectors.map(({ sector, head, ...box }) => head > 0 && (
        <Link key={sector.sector} to={`/screener?sec=${sector.sector}&reg=${region}`} className="hm-head" style={{ ...at(box), height: head }} tabIndex={-1}>
          <span className="clip">{t(`screener.sec.${sector.sector}`)}</span>
          <span className={`num ${direction(sector.changePct)}`}>{f.pct(sector.changePct)}</span>
        </Link>
      ))}
      {placed.industries.map(({ industry, label, ...box }) => label && (
        <span key={`${box.x},${box.y}`} className="hm-ind clip" style={{ left: box.x, top: box.y, width: box.w }} aria-hidden="true">
          {industryLabel(t, industry.key)}
        </span>
      ))}
      {placed.tiles.map(({ tile, tier, ...box }, i) => {
        const { stock } = tile;
        const sym = shortSymbol(stock.symbol);
        const chg = tile.step === 'none' ? '–' : f.pct(stock.changePct);
        const value = tile.value === null ? f.big(null) : `${f.big(tile.value)} ${tile.currency}`;
        return (
          <Link
            key={stock.symbol}
            to={`/stock/${stock.symbol}`}
            className={`hm-tile hm-${tile.step}`}
            data-tier={tier}
            data-sym={stock.symbol}
            tabIndex={i === tabStop ? 0 : -1}
            aria-label={t('heatmap.tileAria', { name: stock.name, sym, industry: industryLabel(t, tile.industry), chg: tile.step === 'none' ? t('heatmap.noTrades') : chg, value })}
            style={at(box)}
          >
            {tier === 'xl' && tile.logo && <Logo tile={tile} />}
            {tier !== 's' && (tier !== 'm' || symbolFits(sym, box.w)) && <span className="hm-sym" style={{ '--n': sym.length } as CSSProperties}>{sym}</span>}
            {(tier === 'xl' || tier === 'l') && <span className="hm-chg num">{chg}</span>}
          </Link>
        );
      })}
    </>
  );
});
