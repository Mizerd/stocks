import { memo, useId, useMemo, useState } from 'react';
import { EXCHANGES, sessionState } from '../../../shared/exchanges';
import type { History, Range, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { isUnavailable, useHistory } from '../../lib/api';
import { scaleOf, smoothPath, spread, timeTicks, toneOf, yOf } from '../../lib/chart';
import type { XY } from '../../lib/chart';
import { direction, useFormat } from '../../lib/format';
import { niceTicks } from '../../lib/indicators';
import { useChartSelection } from '../../lib/useChartSelection';
import { ChartSelection, SelectionReadout } from '../ChartSelection';
import type { Mark } from '../ChartSelection';
import { FreshnessNote, Loading, Notice, Seg, SessionNote, Sparkline } from '../ui';

const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];
const W = 1000;
const H = 300;
// How far past the last traded point the pointer still snaps to it, in viewBox units.
const SNAP_SLACK = 20;
const PLACEHOLDER_HEIGHT = 364;
const DENSE_POINTS = 150;

interface PlotProps {
  points: XY[];
  baseY: number;
  tone: string;
  label: string;
}

const IndexSvg = memo(function IndexSvg({ points, baseY, tone, label }: PlotProps) {
  const fadeId = `fade${useId().replace(/[^\w-]/g, '')}`;
  const line = useMemo(() => smoothPath(points), [points]);
  const lastX = points[points.length - 1][0];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      role="img"
      aria-label={label}
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: tone, stopOpacity: 0.2 }} />
          <stop offset="1" style={{ stopColor: tone, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d="M0 0.5H1000M0 75H1000M0 150H1000M0 225H1000" style={{ fill: 'none', stroke: 'var(--hair)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
      <path d={`${line}L${lastX.toFixed(1)} ${H}L${points[0][0].toFixed(1)} ${H}Z`} style={{ fill: `url(#${fadeId})` }} />
      <path d={`M0 ${baseY.toFixed(1)}H${W}`} style={{ fill: 'none', stroke: 'var(--brass)', strokeWidth: 1, strokeDasharray: '4 4', vectorEffect: 'non-scaling-stroke' }} />
      <path className="sl" d={line} style={{ stroke: tone, strokeWidth: points.length > DENSE_POINTS ? 1.5 : 2 }} />
    </svg>
  );
});

function IndexChart({ index, history, range }: { index: StockSummary; history: History; range: Range }) {
  const { t } = useT();
  const f = useFormat();
  const candles = history.candles.slice(history.warmup);
  const base = history.prevClose ?? candles[0].c;
  const closes = candles.map((c) => c.c);
  const scale = scaleOf([...closes, base], 0.08);

  // On 1D the line only covers the part of the session that has already traded.
  const exchange = EXCHANGES[index.exchange];
  const session = sessionState(exchange, new Date(candles[0].t));
  const intraday = history.interval === 'intraday';
  const start = intraday ? Math.min(session.opensAt.getTime(), candles[0].t) : candles[0].t;
  const end = intraday ? session.closesAt.getTime() : candles[candles.length - 1].t;
  const xOf = (time: number) => (end > start ? ((time - start) / (end - start)) * W : 0);

  const points = useMemo(() => candles.map((c): XY => [xOf(c.t), yOf(c.c, scale, H)]), [history]);
  const baseY = yOf(base, scale, H);
  const last = points[points.length - 1];
  const change = ((closes[closes.length - 1] - base) / base) * 100;

  const ticks = niceTicks(scale.min, scale.max, 5).reverse();
  const labelTimes = intraday
    ? timeTicks(start, end, 5)
    : spread(candles.length, 5).map((i) => candles[i].t);
  const xLabel = (time: number) => {
    if (intraday) return f.time(time);
    if (range === '5Y') return String(new Date(time).getUTCFullYear());
    return range === '1Y' ? f.month(time) : f.dateShort(time, 'UTC');
  };

  const shares = useMemo(() => points.map(([x]) => x / W), [points]);
  const selection = useChartSelection(shares, SNAP_SLACK / W);
  const markOf = (i: number | null): Mark | null =>
    i === null ? null : { t: candles[i].t, c: candles[i].c, left: points[i][0] / 10, top: (points[i][1] / H) * 100 };
  const marks = {
    hover: markOf(selection.hover),
    anchor: markOf(selection.anchor),
    price: (value: number) => f.num(value),
    date: (time: number) => (intraday ? f.time(time) : f.date(time, 'UTC')),
  };

  return (
    <>
      <div style={{ marginTop: 12 }}>
        <SessionNote history={history} exchange={index.exchange} />
        <SelectionReadout {...marks} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <div className="plot-ix" style={{ position: 'relative', flex: '1 1 0%', minWidth: 0, borderBottom: '1px solid var(--ink3)' }}>
          <IndexSvg points={points} baseY={baseY} tone={toneOf(change)} label={`${index.name} ${t('overview.chart')}, ${range}: ${f.pct(change)}`} />
          {intraday && (
            <span
              className={history.session?.kind === 'previous' ? undefined : 'live'}
              style={{
                position: 'absolute', left: `${last[0] / 10}%`, top: `${(last[1] / H) * 100}%`, width: 10, height: 10,
                margin: '-5px 0 0 -5px', borderRadius: '50%', background: toneOf(change), boxShadow: '0 0 0 3px var(--paper)',
              }}
            />
          )}
          {selection.hover === null && selection.anchor === null && (
            <span
              style={{
                position: 'absolute', left: 0, top: `${(baseY / H) * 100}%`, transform: 'translateY(-120%)',
                padding: '0 6px 0 0', fontSize: 11, fontWeight: 500, color: 'var(--brass)', background: 'var(--paper)', whiteSpace: 'nowrap',
              }}
            >
              {t(intraday ? 'overview.base1' : 'overview.baseN')} <span className="num">{f.num(base)}</span>
            </span>
          )}
          <div
            tabIndex={0}
            role="group"
            aria-label={`${t('stock.chartKeys')} ${t('common.selMark')}`}
            className="sel-layer"
            {...selection.handlers}
          >
            <ChartSelection {...marks} />
          </div>
        </div>
        <div className="num plot-ix" style={{ position: 'relative', flex: 'none', width: 60, fontSize: 11, color: 'var(--ink3)', textAlign: 'right' }}>
          {ticks.map((tick) => (
            <span key={tick} style={{ position: 'absolute', right: 0, top: `${(yOf(tick, scale, H) / H) * 100}%`, transform: 'translateY(-50%)' }}>
              {f.num(tick, 0, tick < 100 ? 2 : 0)}
            </span>
          ))}
        </div>
      </div>
      <div className="num" style={{ position: 'relative', height: 20, margin: '6px 70px 0 0', fontSize: 11, color: 'var(--ink3)' }}>
        {labelTimes.map((time, i) => (
          <span key={i} style={{ position: 'absolute', left: `${Math.min(96, Math.max(4, xOf(time) / 10))}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
            {xLabel(time)}
          </span>
        ))}
      </div>
    </>
  );
}

export function IndexPanel({ indices }: { indices: StockSummary[] }) {
  const { t, list } = useT();
  const f = useFormat();
  const [selected, setSelected] = useState(indices[0].symbol);
  const [range, setRange] = useState<Range>('1D');
  const index = indices.find((i) => i.symbol === selected) ?? indices[0];
  const history = useHistory(index.symbol, range);
  const rangeLabels = list('overview.ranges');
  const periods = list('overview.per');

  const visible = history.data && !isUnavailable(history.data) ? history.data : undefined;
  const base = visible ? (visible.prevClose ?? visible.candles[visible.warmup].c) : null;
  const lastClose = visible ? visible.candles[visible.candles.length - 1].c : null;
  // On 1D the quote itself is the freshest figure; on longer ranges use the charted closes.
  const change = range === '1D' ? index.change : base && lastClose ? lastClose - base : null;
  const changePct = range === '1D' ? index.changePct : base && lastClose ? ((lastClose - base) / base) * 100 : null;

  return (
    <div className="pnl">
      <div role="group" aria-label={t('overview.ixLabel')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 6, margin: '0 -10px' }}>
        {indices.map((ix) => (
          <button key={ix.symbol} className={`ix${ix.symbol === index.symbol ? ' on' : ''}`} aria-pressed={ix.symbol === index.symbol} onClick={() => setSelected(ix.symbol)}>
            <span className="lbl">{ix.name}</span>
            <span className="num" style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>{f.num(ix.price)}</span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span className={`num ${direction(ix.changePct)}`} style={{ fontSize: 12.5, fontWeight: 500 }}>{f.pct(ix.changePct)}</span>
              <Sparkline values={ix.spark} change={ix.spark[ix.spark.length - 1] - ix.spark[0]} width={64} height={20} />
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 24px', marginTop: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="ser pnl-title sm">{index.name}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 14px', marginTop: 4 }}>
            <span className="num" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15 }}>{f.num(index.price)}</span>
            <span className={`num ${direction(changePct)}`} style={{ fontSize: 15, fontWeight: 500 }}>
              {f.signed(change)} ({f.pct(changePct)})
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{periods[RANGES.indexOf(range)]}</span>
            <FreshnessNote freshness={index.freshness} time={index.time} />
          </div>
        </div>
        <Seg label={t('common.rgLabel')} value={range} onChange={setRange} options={RANGES.map((r, i) => ({ value: r, label: rangeLabels[i] }))} />
      </div>

      {history.loading && <Loading height={PLACEHOLDER_HEIGHT} />}
      {!history.loading && !visible && <Notice height={PLACEHOLDER_HEIGHT}>{t(history.error ? 'common.error' : 'overview.noIntraday')}</Notice>}
      {visible && <IndexChart key={`${index.symbol} ${range}`} index={index} history={visible} range={range} />}
    </div>
  );
}
