import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { LINE_SWATCHES, ReturnChart } from '../ReturnChart';
import { Loading, Notice, PanelTitle, Seg } from '../ui';
import { useT } from '../../i18n';
import { useHistories } from '../../lib/api';
import { direction, useFormat } from '../../lib/format';
import { alignReturns, COMPARE_RANGES, type CompareRange } from '../../lib/screener';

const CHART_HEIGHT = 300;

interface CompareProps {
  picked: StockSummary[];
  range: CompareRange;
  onRange(range: CompareRange): void;
  onRemove(symbol: string): void;
}

export function Compare({ picked, range, onRange, onRemove }: CompareProps) {
  const { t, list } = useT();
  const f = useFormat();
  const histories = useHistories(picked.map((s) => s.symbol), range);
  const { times, returns } = alignReturns(histories.data ?? []);
  const rangeNames = list('screener.ranges');
  const rangeName = rangeNames[COMPARE_RANGES.indexOf(range)];

  const lines = picked.map((stock, i) => {
    const values = returns[i] ?? [];
    return { symbol: stock.symbol, label: shortSymbol(stock.symbol), values, total: values.at(-1) ?? null };
  });
  const summary = lines.map((line) => `${line.label} ${f.pct(line.total, 1)}`).join(', ');

  function formatX(time: number) {
    if (range === '1M') return f.dateShort(time, 'UTC');
    return f.month(time, range === '5Y');
  }

  return (
    <div className="pnl" style={{ flex: '999 1 600px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px' }}>
        <div>
          <PanelTitle>{t('screener.cmp')}</PanelTitle>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            {times.length > 0 ? t('screener.cmpSince', { date: f.date(times[0], 'UTC') }) : t('screener.cmpNote')}
          </p>
        </div>
        <Seg
          label={t('common.rgLabel')}
          options={COMPARE_RANGES.map((value, i) => ({ value, label: rangeNames[i] }))}
          value={range}
          onChange={onRange}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginTop: 12 }}>
        {lines.map((line, i) => (
          <span
            key={line.symbol}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, padding: '0 4px 0 10px', border: '1px solid var(--hair)', borderRadius: 2, fontSize: 13 }}
          >
            <span aria-hidden="true" style={{ width: 20, borderTop: LINE_SWATCHES[i] }} />
            <span className="num" style={{ fontWeight: 500 }}>{line.label}</span>
            <span className={`num ${direction(line.total)}`}>{f.pct(line.total, 1)}</span>
            <button
              aria-label={`${t('screener.rmL')}: ${line.label}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, color: 'var(--ink3)' }}
              onClick={() => onRemove(line.symbol)}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }} />
              </svg>
            </button>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        {picked.length === 0 ? (
          <Notice height={CHART_HEIGHT}>{t('screener.cmpEmpty')}</Notice>
        ) : histories.loading ? (
          <Loading height={CHART_HEIGHT} />
        ) : times.length === 0 ? (
          <Notice height={CHART_HEIGHT}>{t('common.unavailable')}</Notice>
        ) : (
          <ReturnChart
            times={times}
            series={lines}
            ariaLabel={`${t('screener.chart')}, ${rangeName}: ${summary}`}
            formatX={formatX}
            height={CHART_HEIGHT}
            xLabels={range === '5Y' ? 4 : 6}
          />
        )}
      </div>
    </div>
  );
}
