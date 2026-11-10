import { useState } from 'react';
import type { QuarterFigure, StockDetail } from '../../../shared/types';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import { Notice, PanelTitle, Seg } from '../ui';

type Tab = 'revenue' | 'eps';
const TABS: Tab[] = ['revenue', 'eps'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The source labels quarters as "9/26/2026" (revenue) or "Sep 2026" (EPS).
function periodTime(period: string): number {
  if (period.includes('/')) {
    const [month, , year] = period.split('/').map(Number);
    return Date.UTC(year, month - 1);
  }
  const [month, year] = period.split(' ');
  return Date.UTC(Number(year), MONTHS.indexOf(month));
}

const legendItemStyle = { display: 'flex', alignItems: 'center', gap: 6 } as const;
const columnStyle = { flex: 1, maxWidth: 64, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' } as const;

export function Financials({ detail }: { detail: StockDetail }) {
  const { t, list } = useT();
  const f = useFormat();
  const [tab, setTab] = useState<Tab>('revenue');

  const quarters: QuarterFigure[] = (tab === 'revenue' ? detail.quarterlyRevenue : detail.quarterlyEps).slice(-4);
  const label = (value: number) => (tab === 'revenue' ? f.big(value) : f.num(value));
  const hasEstimates = quarters.some((q) => q.estimate != null);
  const top = Math.max(...quarters.flatMap((q) => [q.value, q.estimate ?? 0]));
  // A loss has no bar to draw, only its figure above the baseline.
  const height = (value: number) => `${top > 0 ? Math.max(0, (value / top) * 84) : 0}%`;
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${quarters.length}, minmax(0, 1fr))`, gap: 20 };
  const tabLabels = list('stock.finTabs');
  const summary = quarters.map((q) => `${f.month(periodTime(q.period), true)} ${label(q.value)}`).join(', ');

  return (
    <div className="pnl" style={{ flex: '999 1 520px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <PanelTitle>{t('stock.fin')}</PanelTitle>
        <Seg label={t('stock.fin')} options={TABS.map((value, i) => ({ value, label: tabLabels[i] }))} value={tab} onChange={setTab} />
      </div>
      {quarters.length === 0 ? (
        <Notice height={200}>{t('stock.finNone')}</Notice>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 8, fontSize: 12, color: 'var(--ink2)' }}>
            {hasEstimates && (
              <span style={legendItemStyle}>
                <span aria-hidden="true" style={{ width: 12, height: 12, border: '1.5px solid var(--ink)' }} />
                {t('stock.finEstimate')}
              </span>
            )}
            <span style={legendItemStyle}>
              <span aria-hidden="true" style={{ width: 12, height: 12, background: 'var(--ink)' }} />
              {t('stock.finReported')}
            </span>
            <span style={{ color: 'var(--ink3)' }}>{detail.summary.currency}</span>
          </div>
          <div role="img" aria-label={`${tabLabels[TABS.indexOf(tab)]}: ${summary}`} style={{ ...grid, height: 320, marginTop: 12, borderBottom: '1px solid var(--ink)' }}>
            {quarters.map((q) => (
              <div key={q.period} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height: '100%' }}>
                {q.estimate != null && (
                  <div style={columnStyle}>
                    <span className="num" style={{ marginBottom: 4, fontSize: 11, color: 'var(--ink2)' }}>{label(q.estimate)}</span>
                    <div style={{ width: '100%', height: height(q.estimate), border: '1.5px solid var(--ink)', borderBottom: 0 }} />
                  </div>
                )}
                <div style={columnStyle}>
                  <span className="num" style={{ marginBottom: 4, fontSize: 11, fontWeight: 500 }}>{label(q.value)}</span>
                  <div style={{ width: '100%', height: height(q.value), background: 'var(--ink)' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="num" style={{ ...grid, marginTop: 6, fontSize: 11.5, color: 'var(--ink3)', textAlign: 'center' }}>
            {quarters.map((q) => <span key={q.period}>{f.month(periodTime(q.period), true)}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
