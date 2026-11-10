import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import { alertState, type SampleAlert } from '../../lib/portfolio';
import { PanelTitle } from '../ui';

export function Alerts({ alerts, stocks }: { alerts: SampleAlert[]; stocks: StockSummary[] }) {
  const { t } = useT();
  const f = useFormat();
  const rows = alerts.flatMap((alert) => {
    const stock = stocks.find((s) => s.symbol === alert.symbol);
    return stock ? [{ alert, stock, state: alertState(alert, stock) }] : [];
  });
  const active = rows.filter((r) => r.state.status !== 'paused').length;

  return (
    <div className="pnl" style={{ flex: '999 1 560px' }}>
      <div className="pnl-head">
        <PanelTitle>{t('portfolio.alerts')}</PanelTitle>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{active} {t('portfolio.of')} {rows.length} {t('portfolio.active')}</span>
      </div>
      <p className="pnl-note">{t('portfolio.alertsNote')}</p>
      <div style={{ marginTop: 10 }}>
        {rows.map(({ alert, stock, state }) => {
          const isMove = alert.type === 'dailyMove';
          const reached = state.status === 'reached';
          return (
            <div
              key={`${alert.symbol}-${alert.type}`}
              className="tbl-row al-row"
              style={{ opacity: state.status === 'paused' ? 0.75 : 1 }}
            >
              <Link to={`/stock/${stock.symbol}`} className="num hl al-sym" style={{ fontWeight: 600 }}>{shortSymbol(stock.symbol)}</Link>
              <div className="al-cond">
                <div>
                  {t(`portfolio.cond.${alert.type}`)}{' '}
                  <span className="num" style={{ fontWeight: 500 }}>
                    {isMove ? f.plainPct(alert.value, 0) : `${f.price(alert.value)} ${stock.currency}`}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                  {t('portfolio.nowP')} <span className="num">{isMove ? f.pct(stock.changePct) : `${f.price(stock.price)} ${stock.currency}`}</span>
                </div>
              </div>
              <div className="al-bar">
                <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--sel)' }}>
                  <div style={{ width: `${state.proximity * 100}%`, height: '100%', borderRadius: 3, background: reached ? 'var(--brass)' : 'var(--ink)' }} />
                </div>
                <div className="num" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink2)' }}>
                  {isMove ? `${t('portfolio.todayIs')} ${f.pct(state.distancePct)}` : reached ? f.pct(-state.distancePct, 1) : `${t('portfolio.left')} ${f.pct(state.distancePct, 1)}`}
                </div>
              </div>
              <span className="al-st" style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', color: reached ? 'var(--brass)' : 'var(--ink2)' }}>
                {t(reached ? 'portfolio.reached' : state.status === 'paused' ? 'portfolio.paused' : 'portfolio.statusActive')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
