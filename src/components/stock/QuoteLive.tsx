import { EXCHANGES, sessionState } from '../../../shared/exchanges';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { LivePill } from '../LivePill';
import { FreshnessNote } from '../ui';

// One status for the price: a live pill and the time of the last trade while the exchange trades
// and the source publishes prices during the day, otherwise the freshness note ("At close · …").
export function QuoteLive({ summary }: { summary: StockSummary }) {
  const { t } = useT();
  const f = useFormat();
  const now = useNow();
  if (summary.freshness === 'eod' || !sessionState(EXCHANGES[summary.exchange], now).isOpen) {
    return <FreshnessNote freshness={summary.freshness} time={summary.time} exchange={summary.exchange} />;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink3)' }}>
      <LivePill live>{t(summary.freshness === 'delayed' ? 'stock.liveDelayed' : 'stock.live')}</LivePill>
      <span className="num">{f.stamp(summary.time)}</span>
    </span>
  );
}

// "After hours 356.90 +0.12 (+0.03%) · 18:42" under a US stock's price.
export function ExtendedLine({ summary }: { summary: StockSummary }) {
  const { t } = useT();
  const f = useFormat();
  const ext = summary.extended;
  if (!ext) return null;
  return (
    <p style={{ flexBasis: '100%', margin: 0, fontSize: 13, color: 'var(--ink2)' }}>
      {t(ext.session === 'pre' ? 'stock.extPre' : 'stock.extPost')}{' '}
      <span className="num" style={{ color: 'var(--ink)', fontWeight: 500 }}>{f.price(ext.price)}</span>{' '}
      <span className={`num ${direction(ext.change)}`}>{f.signed(ext.change)} ({f.pct(ext.changePct)})</span>
      <span style={{ color: 'var(--ink3)' }}> · <span className="num">{f.stamp(ext.time)}</span></span>
    </p>
  );
}
