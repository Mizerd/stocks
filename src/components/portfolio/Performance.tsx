import { useState } from 'react';
import type { FxRates, Range } from '../../../shared/types';
import { useT } from '../../i18n';
import { useHistories } from '../../lib/api';
import { direction, useFormat } from '../../lib/format';
import { returnsPct } from '../../lib/indicators';
import { portfolioReturns, type Position } from '../../lib/portfolio';
import { alignCloses } from '../../lib/series';
import { LINE_SWATCHES, ReturnChart } from '../ReturnChart';
import { Loading, Notice, PanelTitle, Seg } from '../ui';

const RANGES: Range[] = ['1M', '3M', '6M', 'YTD', '1Y'];

interface Props {
  positions: Position[];
  fx: FxRates;
  benchmark: { symbol: string; name: string };
}

export function Performance({ positions, fx, benchmark }: Props) {
  const { t, list } = useT();
  const f = useFormat();
  const [range, setRange] = useState<Range>('1Y');
  const labels = list('portfolio.ranges');
  const symbols = [...positions.map((p) => p.stock.symbol), benchmark.symbol];
  const histories = useHistories(symbols, range);

  const aligned = histories.data ? alignCloses(histories.data) : undefined;
  const benchmarkCloses = aligned?.closes[positions.length] ?? [];
  const ready = aligned && aligned.times.length > 1 && benchmarkCloses.length > 0;
  const portfolio = ready ? portfolioReturns(positions, aligned.closes.slice(0, positions.length), fx) : [];
  const index = ready ? returnsPct(benchmarkCloses) : [];
  const portfolioReturn = portfolio[portfolio.length - 1];
  const indexReturn = index[index.length - 1];
  const lead = portfolioReturn - indexReturn;

  return (
    <div className="pnl" style={{ flex: '999 1 600px' }}>
      <div className="pnl-head">
        <PanelTitle>{t('portfolio.perf')}</PanelTitle>
        <Seg label={t('common.rgLabel')} value={range} onChange={setRange} options={RANGES.map((r, i) => ({ value: r, label: labels[i] }))} />
      </div>
      {histories.loading && <Loading height={340} />}
      {!histories.loading && !ready && <Notice height={340}>{t('common.error')}</Notice>}
      {ready && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', marginTop: 10, fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ width: 18, borderTop: LINE_SWATCHES[0] }} />
              {t('portfolio.pfL')} <span className={`num ${direction(portfolioReturn)}`}>{f.pct(portfolioReturn, 1)}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ width: 18, borderTop: LINE_SWATCHES[1] }} />
              {benchmark.name} <span className={`num ${direction(indexReturn)}`}>{f.pct(indexReturn, 1)}</span>
            </span>
            <span style={{ color: 'var(--ink3)' }}>
              {t(lead >= 0 ? 'portfolio.ahead' : 'portfolio.behind')} <span className="num">{f.num(Math.abs(lead), 1)}</span> {t('portfolio.pp')}
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <ReturnChart
              times={aligned.times}
              series={[{ label: t('portfolio.pfL'), values: portfolio }, { label: benchmark.name, values: index }]}
              ariaLabel={`${t('portfolio.chart', { index: benchmark.name })}, ${labels[RANGES.indexOf(range)]}: ${f.pct(portfolioReturn, 1)} / ${f.pct(indexReturn, 1)}`}
              formatX={(time) => (range === '1M' || range === '3M' ? f.dateShort(time, 'UTC') : f.month(time))}
            />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.perfNote')}</p>
        </>
      )}
    </div>
  );
}
