import type { StockDetail } from '../../../shared/types';
import { useT } from '../../i18n';
import { DASH, direction, useFormat } from '../../lib/format';
import { quarterRows } from '../../lib/quarters';
import { PanelTitle } from '../ui';

// EPS against the analyst estimate: beat, missed or in line, with the size of the surprise.
function Surprise({ value }: { value: number | null }) {
  const { t } = useT();
  const f = useFormat();
  if (value === null) return <>{DASH}</>;
  const verdict = direction(value) === 'up' ? 'finBeat' : direction(value) === 'dn' ? 'finMiss' : 'finMet';
  return (
    <span className={`bdg ${direction(value)}`} style={{ minWidth: 0, fontSize: 12.5 }}>
      <span className="qtr-word">{t(`stock.${verdict}`)} </span>{f.pct(value, 1)}
    </span>
  );
}

// The last four quarters: revenue with its change on the quarter before, EPS against the estimate.
export function Quarters({ detail }: { detail: StockDetail }) {
  const { t } = useT();
  const f = useFormat();
  const rows = quarterRows(detail.quarterlyRevenue, detail.quarterlyEps);
  const top = Math.max(...rows.map((r) => r.revenue ?? 0));

  return (
    <div>
      <PanelTitle>{t('stock.fin')}</PanelTitle>
      <p className="pnl-note">{t('stock.finNote', { currency: detail.summary.currency })}</p>
      <table className="qtr num">
        <thead>
          <tr>
            <th scope="col">{t('stock.finQuarter')}</th>
            <th scope="col">{t('stock.finRevenue')}</th>
            <th scope="col">{t('stock.finEps')}</th>
            <th scope="col">{t('stock.finVsEst')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.time}>
              <th scope="row">{f.month(row.time, true)}</th>
              <td>
                <b>{f.big(row.revenue)}</b>
                <small className={direction(row.revenueChange)}>
                  {row.revenueChange !== null && t('stock.finQoq', { v: f.pct(row.revenueChange, 1) })}
                </small>
                {row.revenue !== null && top > 0 && (
                  <span className="qtr-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, row.revenue / top) * 100}%` }} /></span>
                )}
              </td>
              <td>
                <b>{f.num(row.eps)}</b>
                <small>{row.estimate !== null && t('stock.finEst', { v: f.num(row.estimate) })}</small>
              </td>
              <td><Surprise value={row.surprise} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
