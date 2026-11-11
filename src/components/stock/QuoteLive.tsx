import { EXCHANGES, sessionState } from '../../../shared/exchanges';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { useNow } from '../../lib/useNow';
import { LivePill } from '../LivePill';

// Shown only while the stock's exchange is trading and the source publishes prices during the day.
export function QuoteLive({ summary }: { summary: StockSummary }) {
  const { t } = useT();
  const now = useNow();
  if (summary.freshness === 'eod' || !sessionState(EXCHANGES[summary.exchange], now).isOpen) return null;
  return <LivePill live>{t(summary.freshness === 'delayed' ? 'stock.liveDelayed' : 'stock.live')}</LivePill>;
}
