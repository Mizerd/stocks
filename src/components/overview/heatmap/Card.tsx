import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../../shared/catalog';
import { EXCHANGES } from '../../../../shared/exchanges';
import { useT } from '../../../i18n';
import type { Box, BoardTile } from '../../../lib/heatmap';
import { useFormat } from '../../../lib/format';
import { Badge, FreshnessNote } from '../../ui';

// A company's logo: a one-colour mask in the tile's text colour, or the drawing as is on a light badge.
// --r (width over height) lets wide wordmarks and square marks take a similar area.
export function Logo({ tile }: { tile: BoardTile }) {
  const style = { '--logo': `url(/logos/${tile.logo}.svg)`, '--r': tile.logoRatio ?? 3 } as CSSProperties;
  return <span className={`hm-logo${tile.logoMode === 'badge' ? ' badge' : ''}`} style={style} aria-hidden="true" />;
}

export const industryLabel = (t: (key: string) => string, key: string) => (key.length === 2 ? t('heatmap.other') : t(`heatmap.icb.${key}`));

interface Props {
  tile: BoardTile;
  // The tile's place on the board, and the board's size.
  box: Box;
  width: number;
  height: number;
  pinned: boolean;
}

// Details of one tile, under it or, without room there, above it, always inside the board.
export function Card({ tile, box, width, height, pinned }: Props) {
  const { t } = useT();
  const f = useFormat();
  const ref = useRef<HTMLDivElement>(null);
  const { stock } = tile;
  const cardWidth = Math.min(280, width - 16);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const own = card.offsetHeight;
    const below = box.y + box.h + 6;
    const above = box.y - own - 6;
    const top = below + own <= height ? below : above >= 0 ? above : Math.max(0, height - own);
    card.style.top = `${top}px`;
    card.style.left = `${Math.max(8, Math.min(box.x, width - cardWidth - 8))}px`;
  });

  const sym = shortSymbol(stock.symbol);
  const noTrades = tile.step === 'none';
  return (
    <div ref={ref} className={`hm-card${pinned ? ' pinned' : ''}`} style={{ width: cardWidth }}>
      <div className="hm-card-top">
        {tile.logo && <Logo tile={tile} />}
        <p className="hm-card-name">{stock.name}</p>
        <p className="hm-card-sub">{sym} · {EXCHANGES[stock.exchange].short} · {industryLabel(t, tile.industry)}</p>
      </div>
      <p className="hm-card-price">
        <span className="num">{f.price(stock.price)} {stock.currency}</span>
        {noTrades ? <span className="hm-card-none">{t('heatmap.noTrades')}</span> : <Badge value={stock.changePct} />}
      </p>
      <dl>
        <dt>{t('heatmap.cValue')}</dt>
        <dd className="num">{tile.value === null ? f.big(null) : `${f.big(tile.value)} ${tile.currency}`}</dd>
        <dt>{t('heatmap.cTraded')}</dt>
        <dd className="num">{tile.traded === null ? f.big(null) : `${f.big(tile.traded)} EUR`}</dd>
      </dl>
      <FreshnessNote freshness={stock.freshness} time={stock.time} exchange={stock.exchange} />
      {pinned && <Link className="link hm-open" to={`/stock/${stock.symbol}`}>{t('heatmap.open', { sym })} →</Link>}
    </div>
  );
}
