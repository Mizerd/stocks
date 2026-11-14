import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import { EXCHANGES } from '../../../shared/exchanges';
import type { History, Listing, Range, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { CHART_RANGES, DEFAULT_RANGE, isUnavailable, useHistory } from '../../lib/api';
import { denseIntraday, withLatestQuote } from '../../lib/chart';
import { direction, useFormat } from '../../lib/format';
import { ErrorNotice, Loading, Notice, Seg, SessionNote } from '../ui';
import { ChartPlot } from './ChartPlot';
import type { ChartType, Indicator } from './ChartPlot';

// Where the 1-day chart would be empty or a few lone steps, a month of daily closes is the default.
const SPARSE_DEFAULT: Range = '1M';

// The range a stock page opens on: 1D when the stock trades densely enough, decided once per stock.
function useDefaultRange(inst: Listing, asked: boolean): Range | null {
  const [chosen, setChosen] = useState<{ symbol: string; range: Range } | null>(null);
  const noIntraday = inst.provider === 'euronext';
  const day = useHistory(asked || noIntraday || chosen?.symbol === inst.symbol ? null : inst.symbol, '1D');

  useEffect(() => {
    if (day.loading || (!day.data && !day.error)) return;
    const dense = day.data && !isUnavailable(day.data) && denseIntraday(day.data);
    setChosen({ symbol: inst.symbol, range: dense ? '1D' : SPARSE_DEFAULT });
  }, [day.data, day.error, day.loading, inst.symbol]);

  if (noIntraday) return SPARSE_DEFAULT;
  return chosen?.symbol === inst.symbol ? chosen.range : null;
}
const TYPES: ChartType[] = ['line', 'candles'];

// In the order of the labels in stock.indL.
const INDICATORS: { id: Indicator; swatch: string }[] = [
  { id: 'sma20', swatch: '2px solid var(--brass)' },
  { id: 'sma50', swatch: '2px dashed var(--ink2)' },
  { id: 'bb', swatch: '2px dotted var(--ink3)' },
  { id: 'vol', swatch: '2px solid var(--ink3)' },
  { id: 'rsi', swatch: '2px solid var(--ink)' },
];

const PLOT_AREA_HEIGHT = 480;

// Change over the visible window, measured from the close just before it.
function rangeReturn(history: History): number | null {
  const visible = history.candles.slice(history.warmup);
  if (visible.length === 0) return null;
  const base = history.prevClose ?? visible[0].c;
  return (visible[visible.length - 1].c / base - 1) * 100;
}

export function PriceChart({ inst, quote }: { inst: Listing; quote?: StockSummary }) {
  const { t, list } = useT();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState<Record<Indicator, boolean>>({ sma20: true, sma50: false, bb: false, vol: true, rsi: true });

  const asked = CHART_RANGES.find((r) => r === params.get('range'));
  const autoRange = useDefaultRange(inst, Boolean(asked));
  // While the default is still being chosen the chart waits, so it never flashes the wrong range.
  const deciding = !asked && autoRange === null;
  const range = asked ?? autoRange ?? DEFAULT_RANGE;
  const type: ChartType = params.get('type') === 'candles' ? 'candles' : 'line';
  const { data, error, loading } = useHistory(deciding ? null : inst.symbol, range);
  const loaded = data && !isUnavailable(data) && data.candles.length > data.warmup ? data : undefined;
  const exchange = EXCHANGES[inst.exchange];
  const history = useMemo(() => loaded && withLatestQuote(loaded, quote, exchange), [loaded, quote, exchange]);
  const change = history ? rangeReturn(history) : null;

  // Defaults stay out of the URL.
  function setParam(name: string, value: string, fallback: string) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  const rangeLabels = list('stock.ranges');
  const typeLabels = list('stock.types');
  const indicatorLabels = list('stock.indL');
  const rangeIndex = CHART_RANGES.indexOf(range);
  const session = history?.session?.kind;
  const period = session === 'previous' ? t('stock.perPrev') : session === 'premarket' ? t('stock.perPre') : list('stock.per')[rangeIndex];

  function plotArea() {
    if (history) {
      const label = t('stock.chart', { name: shortSymbol(inst.symbol), range: rangeLabels[rangeIndex], pct: f.pct(change) });
      return (
        <>
          <SessionNote history={history} exchange={inst.exchange} />
          <ChartPlot key={`${inst.symbol} ${range} ${type}`} history={history} exchange={inst.exchange} type={type} shown={shown} label={label} />
        </>
      );
    }
    if (loading || deciding) return <Loading height={PLOT_AREA_HEIGHT} />;
    if (error) return <ErrorNotice height={PLOT_AREA_HEIGHT} />;
    if (range !== '1D') return <Notice height={PLOT_AREA_HEIGHT}>{t('stock.noHistory')}</Notice>;
    return <Notice height={PLOT_AREA_HEIGHT}>{t(inst.provider === 'euronext' ? 'stock.noIntradayEod' : 'stock.noIntradayYet')}</Notice>;
  }

  return (
    <div className="pnl">
      <div className="tb">
        <Seg
          label={t('common.rgLabel')}
          options={CHART_RANGES.map((r, i) => ({ value: r, label: rangeLabels[i] }))}
          value={range}
          onChange={(r) => setParam('range', r, autoRange ?? DEFAULT_RANGE)}
        />
        <Seg
          label={t('stock.typeLabel')}
          options={TYPES.map((value, i) => ({ value, label: typeLabels[i] }))}
          value={type}
          onChange={(value) => setParam('type', value, 'line')}
        />
        {change !== null && (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className={`num ${direction(change)}`} style={{ fontSize: 13.5, fontWeight: 600 }}>{f.pct(change)}</span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{period}</span>
          </span>
        )}
        <div role="group" aria-label={t('stock.ind')} className="tb-chips">
          {INDICATORS.map(({ id, swatch }, i) => (
            <button
              key={id}
              className={`chip${shown[id] ? ' on' : ''}`}
              aria-pressed={shown[id]}
              onClick={() => setShown({ ...shown, [id]: !shown[id] })}
            >
              <span aria-hidden="true" style={{ flex: 'none', width: 14, height: 0, borderTop: swatch }} />
              {indicatorLabels[i]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>{plotArea()}</div>
    </div>
  );
}
