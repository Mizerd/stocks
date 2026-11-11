import type { FocusEvent } from 'react';
import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { anyMarketOpen } from '../../lib/market';
import { useFlash } from '../../lib/useFlash';
import { useNow } from '../../lib/useNow';
import { LivePill } from '../LivePill';

// Seconds one item takes to cross, so the tape moves at the same speed however long it is.
const SECONDS_PER_ITEM = 5.5;

function TapeItem({ item, hidden }: { item: StockSummary; hidden: boolean }) {
  const f = useFormat();
  const flash = useFlash(item.price);
  return (
    <Link to={`/stock/${item.symbol}`} className="tape-item num" tabIndex={hidden ? -1 : undefined}>
      <span style={{ fontWeight: 600 }}>{item.kind === 'index' ? item.name : shortSymbol(item.symbol)}</span>
      <span key={flash.tick} className={flash.className} style={{ color: 'var(--ink2)' }}>{f.price(item.price)}</span>
      <span className={direction(item.changePct)} style={{ fontWeight: 500 }}>{f.pct(item.changePct)}</span>
    </Link>
  );
}

export function TickerTape({ items }: { items: StockSummary[] }) {
  const { t } = useT();
  const live = anyMarketOpen(useNow());
  if (items.length === 0) return null;

  // Tabbing to a link scrolls the clipped box to it; put it back once focus leaves the tape.
  const resetScroll = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.scrollLeft = 0;
  };

  return (
    <div className="wrap">
      <div className="tape-row">
        <LivePill live={live}>{t(live ? 'overview.live' : 'overview.closed')}</LivePill>
        <nav className="tape-box" aria-label={t('overview.tape')} onBlur={resetScroll}>
          <div className="tape" style={{ animationDuration: `${items.length * SECONDS_PER_ITEM}s` }}>
            {/* Rendered twice so the loop is seamless; only the first copy is read out and focusable. */}
            {[false, true].map((hidden) => (
              <div key={String(hidden)} className="tape-set" aria-hidden={hidden || undefined}>
                {items.map((item) => <TapeItem key={item.symbol} item={item} hidden={hidden} />)}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
