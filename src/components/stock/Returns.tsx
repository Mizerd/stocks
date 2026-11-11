import { findInstrument, shortSymbol } from '../../../shared/catalog';
import type { History, Instrument } from '../../../shared/types';
import { useT } from '../../i18n';
import { useHistories } from '../../lib/api';
import { direction, useFormat } from '../../lib/format';
import { BENCHMARK, periodStart, RETURN_PERIODS, returnSince } from '../../lib/returns';
import { PanelTitle } from '../ui';

const lastClose = (history: History) => history.candles[history.candles.length - 1].c;

// Bar from the centre line for the stock, a tick for the index, both on the same scale.
function ReturnBar({ own, index, top }: { own: number | null; index: number | null; top: number }) {
  const half = (value: number) => Math.min(50, (Math.abs(value) / top) * 50);
  return (
    <span className="ret-track" aria-hidden="true">
      {own !== null && (
        <span className={`ret-bar ${own < 0 ? 'dn' : 'up'}`} style={{ left: `${own < 0 ? 50 - half(own) : 50}%`, width: `${half(own)}%` }} />
      )}
      {index !== null && <span className="ret-tick" style={{ left: `${50 + Math.sign(index) * half(index)}%` }} />}
    </span>
  );
}

// Price return over standard periods, next to the region's index.
export function Returns({ inst, price }: { inst: Instrument; price: number }) {
  const { t, list } = useT();
  const f = useFormat();
  const benchmark = findInstrument(BENCHMARK[inst.region])!;
  const symbols = [inst.symbol, benchmark.symbol];
  // Daily bars cover every period up to a year; the five-year figure needs the weekly ones.
  const year = useHistories(symbols, '1Y');
  const fiveYears = useHistories(symbols, '5Y');
  const now = Date.now();
  const labels = list('stock.perfPeriods');

  const rows = RETURN_PERIODS.map((period, i) => {
    const source = period === '5Y' ? fiveYears : year;
    const [own, index] = source.data ?? [];
    const from = periodStart(period, now);
    return {
      label: labels[i],
      loading: source.loading,
      own: own ? returnSince(own.candles, from, price) : null,
      index: index ? returnSince(index.candles, from, lastClose(index)) : null,
    };
  });
  // Scaled to the periods up to a year; a larger five-year move simply fills its half of the track.
  const top = Math.max(1, ...rows.slice(0, -1).flatMap((r) => [Math.abs(r.own ?? 0), Math.abs(r.index ?? 0)]));
  const figure = (value: number | null, loading: boolean) =>
    loading ? <span className="skel" style={{ display: 'inline-block', width: 44, height: 6 }} /> : f.pct(value, 1);

  return (
    <div>
      <PanelTitle>{t('stock.perf')}</PanelTitle>
      <p className="pnl-note">{t('stock.perfNote', { name: benchmark.name })}</p>
      <table className="ret num">
        <thead>
          <tr>
            <th scope="col"><span className="sr">{t('stock.perfPeriod')}</span></th>
            <td />
            <th scope="col">{shortSymbol(inst.symbol)}</th>
            <th scope="col"><span className="ret-key" aria-hidden="true" />{benchmark.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className="ret-plot"><ReturnBar own={row.own} index={row.index} top={top} /></td>
              <td className={direction(row.own)} style={{ fontWeight: 600 }}>{figure(row.own, row.loading)}</td>
              <td style={{ color: 'var(--ink2)' }}>{figure(row.index, row.loading)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
