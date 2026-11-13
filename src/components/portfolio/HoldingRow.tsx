import { Link } from 'react-router-dom';
import { findInstrument, shortSymbol } from '../../../shared/catalog';
import { useT } from '../../i18n';
import { DASH, direction, useFormat } from '../../lib/format';
import { yearRange } from '../../lib/portfolio';
import type { Row } from '../../lib/portfolio';
import { prefetchProps } from '../../lib/prefetch';
import { Badge, Sparkline } from '../ui';

interface Props {
  row: Row;
  // False when the list has no positions: the value, gain and weight columns are left out.
  valued: boolean;
  // The largest weight in the list, which fills the whole weight bar.
  largest: number;
  actions?: { edit(): void; remove(): void };
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// One stock of the list: a link to its page with, for the visitor's own list, edit and remove buttons.
export function HoldingRow({ row: { entry, stock, position }, valued, largest, actions }: Props) {
  const { t } = useT();
  const f = useFormat();
  const symbol = shortSymbol(entry.symbol);
  const year = yearRange(stock);
  const spark = stock?.spark ?? [];
  const details = [entry.buyDate && t('portfolio.bought', { date: f.date(entry.buyDate, 'UTC') }), entry.note].filter(Boolean).join(' · ');
  return (
    <div className="hd-item">
      <Link to={`/stock/${entry.symbol}`} className="row tbl-row hd-cols" {...prefetchProps(entry.symbol)}>
        <span className="num c-sym" style={{ fontWeight: 600 }}>{symbol}</span>
        <span className="c-name" style={{ minWidth: 0 }}>
          <span className="clip" style={{ display: 'block' }}>{stock?.name ?? findInstrument(entry.symbol)?.name}</span>
          {details && <span className="clip hd-note">{details}</span>}
        </span>
        <span className="c-tr hd-tr">
          {spark.length > 1 && <Sparkline values={spark} change={spark[spark.length - 1] - spark[0]} width="100%" height={22} />}
          {year && (
            <span className="hd-yr" title={t('portfolio.yearRange', { low: f.price(year.low), high: f.price(year.high) })}>
              <span style={{ left: `${year.position}%` }} />
            </span>
          )}
        </span>
        {valued && (
          <>
            <span className="num r c-qty" style={{ fontSize: 13 }}>{position ? f.num(entry.quantity, 0, 4) : DASH}</span>
            <span className="num r c-avg" style={{ fontSize: 13, color: 'var(--ink2)' }}>{position ? f.price(entry.buyPrice) : DASH}</span>
          </>
        )}
        <span className="num r c-price" style={{ fontSize: 13 }}>
          {stock ? <>{f.price(stock.price)} <span className="cur">{stock.currency}</span></> : <span style={{ color: 'var(--ink3)' }}>{t('portfolio.noQuote')}</span>}
        </span>
        {valued && <span className="num r c-val" style={{ fontWeight: 600 }}>{position && `${f.num(position.valueEur)} €`}</span>}
        <span className="r c-day">{stock && <Badge value={stock.changePct} />}</span>
        {valued && (
          <>
            {position ? (
              <span className={`num r c-pl ${direction(position.gainEur)}`} style={{ fontSize: 13 }}>
                {f.signed(position.gainEur)} € · {f.pct(position.gainPct, 1)}
              </span>
            ) : (
              <span className="r c-pl" style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.watching')}</span>
            )}
            <span className="c-w hd-w">
              {position && (
                <>
                  <span style={{ flex: '1 1 0%', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--sel)' }}>
                    <span style={{ display: 'block', width: `${(position.weight / largest) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--ink)' }} />
                  </span>
                  <span className="num" style={{ width: 52, fontSize: 12.5, textAlign: 'right', color: 'var(--ink2)' }}>{f.plainPct(position.weight * 100, 1)}</span>
                </>
              )}
            </span>
          </>
        )}
      </Link>
      {actions && (
        <span className="hd-act">
          <button type="button" className="icon-btn" aria-label={t('portfolio.edit', { symbol })} title={t('portfolio.edit', { symbol })} onClick={() => actions.edit()}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5l.6-3L10.6 3l2.4 2.4-7.5 7.5zM9 4.6L11.4 7" style={ICON} /></svg>
          </button>
          <button
            type="button" className="icon-btn" aria-label={t('portfolio.remove', { symbol })} title={t('portfolio.remove', { symbol })}
            onClick={actions.remove}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" style={ICON} /></svg>
          </button>
        </span>
      )}
    </div>
  );
}
