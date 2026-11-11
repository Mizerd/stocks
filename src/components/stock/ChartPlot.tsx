import { EXCHANGES } from '../../../shared/exchanges';
import type { Candle, ExchangeId, History } from '../../../shared/types';
import { useT } from '../../i18n';
import { linePath, scaleOf, yOf } from '../../lib/chart';
import { direction, useFormat } from '../../lib/format';
import { bollinger, niceTicks, rsi, sma } from '../../lib/indicators';
import { useChartSelection } from '../../lib/useChartSelection';
import { ChartSelection, SelectionReadout } from '../ChartSelection';
import type { Mark } from '../ChartSelection';

export type ChartType = 'line' | 'candles';
export type Indicator = 'sma20' | 'sma50' | 'bb' | 'vol' | 'rsi';

const W = 1000;
const PLOT_H = 400;
const VOLUME_H = 64;
const RSI_H = 72;
const BAR_MS = 5 * 60_000;
const AXIS_WIDTH = 62;

const svgStyle = { position: 'absolute', inset: 0, display: 'block' } as const;
const subLabelStyle = { position: 'absolute', left: 0, top: -2, paddingRight: 6, background: 'var(--paper)' } as const;

interface Props {
  history: History;
  exchange: ExchangeId;
  type: ChartType;
  shown: Record<Indicator, boolean>;
  label: string;
}

// How many 5-minute bars fit in one trading session.
function sessionSlots(exchange: ExchangeId): number {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const { open, close } = EXCHANGES[exchange];
  return (minutes(close) - minutes(open)) / 5;
}

function pathOf(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  const points: [number, number][] = [];
  values.forEach((v, i) => {
    if (v !== null) points.push([x(i), y(v)]);
  });
  return linePath(points);
}

const rect = (x: number, y: number, width: number, height: number) =>
  `M${x.toFixed(1)} ${y.toFixed(1)}h${width.toFixed(1)}v${height.toFixed(1)}h-${width.toFixed(1)}z`;

// Rising and falling candles as two paths, so each can have its own fill.
function candlePaths(bars: Candle[], x: (i: number) => number, y: (v: number) => number, width: number) {
  let up = '';
  let down = '';
  bars.forEach((bar, i) => {
    const mid = x(i).toFixed(1);
    const top = y(Math.max(bar.o, bar.c));
    const bottom = y(Math.min(bar.o, bar.c));
    const body = rect(x(i) - width / 2, top, width, Math.max(0.6, bottom - top));
    if (bar.c >= bar.o) {
      // The wick stops at the body so it does not show through the hollow candle.
      up += `M${mid} ${y(bar.h).toFixed(1)}V${top.toFixed(1)}M${mid} ${bottom.toFixed(1)}V${y(bar.l).toFixed(1)}${body}`;
    } else {
      down += `M${mid} ${y(bar.h).toFixed(1)}V${y(bar.l).toFixed(1)}${body}`;
    }
  });
  return { up, down };
}

function volumePaths(bars: Candle[], x: (i: number) => number, width: number) {
  const max = Math.max(...bars.map((bar) => bar.v ?? 0));
  let up = '';
  let down = '';
  bars.forEach((bar, i) => {
    if (bar.v === null) return;
    const height = (bar.v / max) * (VOLUME_H - 10);
    const path = rect(x(i) - width / 2, VOLUME_H - height, width, height);
    if (bar.c >= bar.o) up += path;
    else down += path;
  });
  return { up, down };
}

export function ChartPlot({ history, exchange, type, shown, label }: Props) {
  const { t } = useT();
  const f = useFormat();

  const intraday = history.interval === 'intraday';
  const closes = history.candles.map((c) => c.c);
  const bars = history.candles.slice(history.warmup);
  const sma20 = sma(closes, 20).slice(history.warmup);
  const sma50 = sma(closes, 50).slice(history.warmup);
  const bands = bollinger(closes).slice(history.warmup);
  const rsi14 = rsi(closes).slice(history.warmup);
  const last = bars.length - 1;

  // Intraday bars sit at their time of day, so the line grows across the session and quiet
  // minutes leave a gap. Daily and weekly bars are simply spread evenly.
  const slotOf = (i: number) => (intraday ? Math.round((bars[i].t - bars[0].t) / BAR_MS) : i);
  const slots = intraday ? Math.max(sessionSlots(exchange), slotOf(last) + 1) : bars.length;
  const slotWidth = W / slots;
  const x = (i: number) => (slotOf(i) + 0.5) * slotWidth;
  const barWidth = Math.min(27, Math.max(1.4, slotWidth * 0.6));

  // The line only draws closes, so fitting the axis to highs and lows would leave it half empty.
  const extremes = type === 'line' ? bars.map((bar) => bar.c) : bars.flatMap((bar) => [bar.l, bar.h]);
  if (shown.bb) bands.forEach((band) => band && extremes.push(band.lower, band.upper));
  const scale = scaleOf(extremes, 0.07);
  const y = (value: number) => yOf(value, scale, PLOT_H);
  const percentY = (value: number) => `${(y(value) / PLOT_H) * 100}%`;

  const ticks = niceTicks(scale.min, scale.max);
  const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const tickDecimals = tickStep >= 10 ? 0 : tickStep >= 1 ? 1 : tickStep >= 0.01 ? 2 : 3;
  // Index levels in the tens of thousands would not fit the axis with decimals.
  const axisPrice = (value: number) => (value >= 10_000 ? f.num(value, 0) : f.price(value));

  const line = pathOf(closes.slice(history.warmup), x, y);
  const candles = candlePaths(bars, x, y, barWidth);
  const upper = bands.map((band) => band && band.upper);
  const lower = bands.map((band) => band && band.lower);
  const bandPoints = bands.flatMap((band, i): [number, number][] => (band ? [[x(i), y(band.upper)]] : []));
  const bandFloor = bands.flatMap((band, i): [number, number][] => (band ? [[x(i), y(band.lower)]] : []));
  const bandArea = bandPoints.length ? `${linePath([...bandPoints, ...bandFloor.reverse()])}Z` : '';

  const hasVolume = bars.some((bar) => bar.v !== null);
  const volume = volumePaths(bars, x, barWidth);

  const barDate = (time: number) => (intraday ? f.time(time) : f.date(time, 'UTC'));

  const selection = useChartSelection(bars.map((_, i) => x(i) / W), slotWidth / W);
  const markOf = (i: number | null): Mark | null =>
    i === null ? null : { t: bars[i].t, c: bars[i].c, left: (x(i) / W) * 100, top: (y(bars[i].c) / PLOT_H) * 100 };
  const marks = { hover: markOf(selection.hover), anchor: markOf(selection.anchor), price: f.price, date: barDate };

  const active = selection.hover ?? selection.anchor ?? last;
  const bar = bars[active];
  const before = history.candles[history.warmup + active - 1]?.c ?? history.prevClose;
  const change = before ? (bar.c / before - 1) * 100 : null;

  function axisDate(time: number): string {
    if (intraday) return f.time(time);
    if (history.range === '5Y') return f.month(time, true);
    if (history.range === '1Y') return f.month(time);
    return f.dateShort(time, 'UTC');
  }
  const labelCount = Math.min(6, slots);
  const xLabels = Array.from({ length: labelCount }, (_, k) => {
    const slot = Math.floor(((k + 0.5) * slots) / labelCount);
    const time = intraday ? bars[0].t + slot * BAR_MS : bars[slot].t;
    return { left: `${((slot + 0.5) / slots) * 100}%`, text: axisDate(time) };
  });

  return (
    <div>
      <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', minHeight: 20, fontSize: 12, color: 'var(--ink2)' }}>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{barDate(bar.t)}</span>
        <span>{t('stock.o')} {f.price(bar.o)}</span>
        <span>{t('stock.h')} {f.price(bar.h)}</span>
        <span>{t('stock.l')} {f.price(bar.l)}</span>
        <span>{t('stock.c')} {f.price(bar.c)}</span>
        <span className={direction(change)} style={{ fontWeight: 500 }}>{f.pct(change)}</span>
        {shown.sma20 && <span style={{ color: 'var(--brass)' }}>SMA 20 {f.price(sma20[active])}</span>}
        {shown.sma50 && <span>SMA 50 {f.price(sma50[active])}</span>}
        {shown.bb && (
          <span style={{ color: 'var(--ink3)' }}>
            {t('stock.bb')} {bands[active] ? `${f.price(bands[active].lower)}–${f.price(bands[active].upper)}` : f.price(null)}
          </span>
        )}
      </div>

      <SelectionReadout {...marks} />

      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <div className="plot-main" style={{ position: 'relative', flex: 1, minWidth: 0, borderTop: '1px solid var(--hair)', borderBottom: '1px solid var(--ink3)' }}>
          <svg viewBox={`0 0 ${W} ${PLOT_H}`} preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label={label} style={svgStyle}>
            <path d={ticks.map((v) => `M0 ${y(v).toFixed(1)}H${W}`).join('')} style={{ fill: 'none', stroke: 'var(--hair)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
            {shown.bb && (
              <>
                <path d={bandArea} style={{ fill: 'var(--sel)', opacity: 0.6 }} />
                <path className="sl lbb" d={pathOf(upper, x, y)} />
                <path className="sl lbb" d={pathOf(lower, x, y)} />
              </>
            )}
            {type === 'line' ? (
              <>
                <path d={`${line}L${x(last).toFixed(1)} ${PLOT_H}L${x(0).toFixed(1)} ${PLOT_H}Z`} style={{ fill: 'var(--sel)' }} />
                <path className="sl" d={line} style={{ strokeWidth: 2 }} />
              </>
            ) : (
              <>
                <path className="cu" d={candles.up} />
                <path className="cd" d={candles.down} />
              </>
            )}
            {shown.sma50 && <path className="sl l50" d={pathOf(sma50, x, y)} />}
            {shown.sma20 && <path className="sl l20" d={pathOf(sma20, x, y)} />}
          </svg>
          {type === 'line' && (
            <span
              className={intraday ? 'live' : undefined}
              aria-hidden="true"
              style={{
                position: 'absolute', left: `${(x(last) / W) * 100}%`, top: percentY(bars[last].c), width: 10, height: 10,
                margin: '-5px 0 0 -5px', borderRadius: '50%', background: 'var(--brass)', boxShadow: '0 0 0 3px var(--paper)',
              }}
            />
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
        <div className="num plot-main" aria-hidden="true" style={{ position: 'relative', flex: 'none', width: AXIS_WIDTH, fontSize: 11, color: 'var(--ink3)' }}>
          {ticks.map((v) => (
            <span key={v} style={{ position: 'absolute', left: 4, top: percentY(v), transform: 'translateY(-50%)' }}>{f.num(v, tickDecimals)}</span>
          ))}
          <span style={{ position: 'absolute', left: 0, right: 0, top: percentY(bars[last].c), transform: 'translateY(-50%)', padding: '1px 4px', borderRadius: 4, fontWeight: 600, background: 'var(--ink)', color: 'var(--paper)' }}>
            {axisPrice(bars[last].c)}
          </span>
        </div>
      </div>

      {shown.vol && hasVolume && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, height: VOLUME_H, borderBottom: '1px solid var(--hair)' }}>
            <svg viewBox={`0 0 ${W} ${VOLUME_H}`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={svgStyle}>
              <path className="cu" d={volume.up} />
              <path className="cd" d={volume.down} style={{ opacity: 0.8 }} />
            </svg>
            <span className="lbl" style={subLabelStyle}>
              {t('stock.vol')} · <span className="num" style={{ color: 'var(--ink)', textTransform: 'none' }}>{f.big(bar.v)}</span>
            </span>
          </div>
          <div style={{ flex: 'none', width: AXIS_WIDTH }} />
        </div>
      )}
      {shown.vol && !hasVolume && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink3)' }}>
          <span className="lbl">{t('stock.vol')}</span> · {t('stock.volNone')}
        </p>
      )}

      {shown.rsi && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, height: RSI_H, borderBottom: '1px solid var(--hair)' }}>
            <svg viewBox={`0 0 ${W} ${RSI_H}`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={svgStyle}>
              <path d={`M0 ${RSI_H * 0.3}H${W}M0 ${RSI_H * 0.7}H${W}`} style={{ fill: 'none', stroke: 'var(--ink3)', strokeWidth: 1, strokeDasharray: '2 4', vectorEffect: 'non-scaling-stroke' }} />
              <path className="sl" d={pathOf(rsi14, x, (v) => (RSI_H * (100 - v)) / 100)} style={{ strokeWidth: 1.25 }} />
            </svg>
            <span className="lbl" style={subLabelStyle}>
              RSI 14 · <span className="num" style={{ color: 'var(--ink)' }}>{f.num(rsi14[active], 1)}</span>
            </span>
          </div>
          <div className="num" aria-hidden="true" style={{ position: 'relative', flex: 'none', width: AXIS_WIDTH, height: RSI_H, fontSize: 11, color: 'var(--ink3)' }}>
            <span style={{ position: 'absolute', left: 4, top: '30%', transform: 'translateY(-50%)' }}>70</span>
            <span style={{ position: 'absolute', left: 4, top: '70%', transform: 'translateY(-50%)' }}>30</span>
          </div>
        </div>
      )}

      <div className="num x-dates" aria-hidden="true" style={{ position: 'relative', height: 20, margin: `8px ${AXIS_WIDTH + 10}px 0 0`, fontSize: 11, color: 'var(--ink3)' }}>
        {xLabels.map((item) => (
          <span key={item.left} style={{ position: 'absolute', left: item.left, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{item.text}</span>
        ))}
      </div>
    </div>
  );
}
