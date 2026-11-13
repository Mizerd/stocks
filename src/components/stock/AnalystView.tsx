import type { StockDetail, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';

interface Props {
  analysts: NonNullable<StockDetail['analysts']>;
  summary: StockSummary;
}

export function AnalystView({ analysts, summary }: Props) {
  const { t } = useT();
  const f = useFormat();
  const { buy, hold, sell, target } = analysts;
  const total = buy + hold + sell;
  const share = (count: number) => `${(count / total) * 100}%`;
  const upside = target !== null ? (target / summary.price - 1) * 100 : null;

  return (
    <section className="pnl">
      <h2 className="ser pnl-title" style={{ marginBottom: 12 }}>{t('stock.an')}</h2>
      {total > 0 && (
        <>
          <div role="img" aria-label={t('stock.anAria', { n: total, buy, hold, sell })} style={{ display: 'flex', height: 14, border: '1px solid var(--ink)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ width: share(buy), background: 'var(--ink)' }} />
            <span style={{ width: share(hold), background: 'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 5px)' }} />
            <span style={{ width: share(sell), borderLeft: '1px solid var(--ink)' }} />
          </div>
          <div className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6, fontSize: 12 }}>
            <span>{t('stock.buy')} {buy}</span>
            <span>{t('stock.hold')} {hold}</span>
            <span>{t('stock.sell')} {sell}</span>
          </div>
        </>
      )}
      {target !== null && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink2)' }}>
          {t('stock.target')}{' '}
          <span className="num" style={{ color: 'var(--ink)', fontWeight: 500 }}>{f.price(target)} {summary.currency}</span>{' '}
          <span className={`num ${direction(upside)}`}>{f.pct(upside, 1)}</span>
        </p>
      )}
    </section>
  );
}
