import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { EXCHANGES, US_PREMARKET_OPEN, zonedTime } from '../../../shared/exchanges';
import type { Candle, ExchangeId, History } from '../../../shared/types';
import { useT } from '../../i18n';
import { aggregateCandles, barInterval, curvePath, runs, scaleOf, smoothPath, SMOOTH_MIN, timeTicks, toneOf, yOf } from '../../lib/chart';
import { createFormat, DASH, direction } from '../../lib/format';
import type { Format } from '../../lib/format';
import { bollinger, drawable, niceTicks, rsi, sma } from '../../lib/indicators';
import { useChartSelection } from '../../lib/useChartSelection';
import { useSettings } from '../../settings';
import { ChartSelection, SelectionReadout } from '../ChartSelection';
import type { Mark } from '../ChartSelection';

export type ChartType = 'line' | 'candles';
export type Indicator = 'sma20' | 'sma50' | 'bb' | 'vol' | 'rsi';

const W = 1000;
const PLOT_H = 400;
const VOLUME_H = 64;
const RSI_H = 72;
// Room above 100 and below 0, so the RSI line is never cut by the panel's edge.
const RSI_PAD = 4;
const AXIS_WIDTH = 62;
const MINUTE = 60_000;
const CANDLE_MS = 5 * MINUTE;
const CANDLE_SHARE = 0.6;
const MIN_CANDLE_PX = 2;
// Below this many pixels per bar, volume bars lose their outline so gaps stay visible.
const SOLID_BAR_PX = 4;
const DENSE_POINTS = 150;

const svgStyle = { position: 'absolute', inset: 0, display: 'block' } as const;
const subLabelStyle = { position: 'absolute', left: 0, top: -2, paddingRight: 6, background: 'var(--paper)' } as const;
const gridStyle = { fill: 'none', stroke: 'var(--hair)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;

interface Props {
  history: History;
  exchange: ExchangeId;
  type: ChartType;
  shown: Record<Indicator, boolean>;
  label: string;
  // Given, the readout shows this name and the close alone, for series with one value a day (fund NAVs).
  valueLabel?: string;
}

// The time an intraday chart spans: a session from its first bar, or the US pre-market up to the open.
function timeWindow(history: History, exchange: ExchangeId): { start: number; minutes: number } {
  const ex = EXCHANGES[exchange];
  const { session } = history;
  if (session?.kind === 'premarket') {
    const start = zonedTime(session.day, US_PREMARKET_OPEN, ex.timezone).getTime();
    return { start, minutes: (zonedTime(session.day, ex.open, ex.timezone).getTime() - start) / MINUTE };
  }
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  return { start: history.candles[0].t, minutes: minutes(ex.close) - minutes(ex.open) };
}

const rsiY = (value: number) => RSI_PAD + ((RSI_H - 2 * RSI_PAD) * (100 - value)) / 100;
const rsiTop = (value: number) => `${(rsiY(value) / RSI_H) * 100}%`;

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// 1-minute candles and volume bars on a full session can be thinner than a couple of pixels;
// those are drawn per 5 minutes instead. The line, hover and legend keep every minute.
function barSpan(history: History, exchange: ExchangeId, plotWidth: number): number {
  if (history.interval !== 'intraday') return 0;
  const step = barInterval(history.candles.map((bar) => bar.t));
  const slots = (timeWindow(history, exchange).minutes * MINUTE) / step;
  return step < CANDLE_MS && (plotWidth * CANDLE_SHARE) / slots < MIN_CANDLE_PX ? CANDLE_MS : 0;
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

function bandArea(points: [number, number][][], floor: [number, number][][]): string {
  return points.map((run, k) => `${smoothPath(run)}${smoothPath([...floor[k]].reverse(), 'L')}Z`).join('');
}

// Positions, indicators and every SVG path of the chart. Built once per history and options,
// not on each pointer move.
function buildChart(history: History, exchange: ExchangeId, type: ChartType, shown: Record<Indicator, boolean>, spanMs: number) {
  const intraday = history.interval === 'intraday';
  const closes = history.candles.map((c) => c.c);
  const bars = history.candles.slice(history.warmup);
  const last = bars.length - 1;
  const sma20 = sma(closes, 20).slice(history.warmup);
  const sma50 = sma(closes, 50).slice(history.warmup);
  const bands = bollinger(closes).slice(history.warmup);
  const rsi14 = rsi(closes).slice(history.warmup);
  // Short windows without warm-up bars leave too few values; a stub at the right edge would mislead.
  const has = { sma20: drawable(sma20), sma50: drawable(sma50), bb: drawable(bands), rsi: drawable(rsi14) };

  // Intraday bars sit at their time of day, so the line grows across the session and quiet
  // minutes leave a gap. Daily and weekly bars are simply spread evenly.
  const step = intraday ? barInterval(bars.map((bar) => bar.t)) : 1;
  const { start, minutes } = timeWindow(history, exchange);
  const slotOf = (i: number) => (intraday ? Math.round((bars[i].t - start) / step) : i);
  const slots = intraday ? Math.max(Math.round((minutes * MINUTE) / step), slotOf(last) + 1) : bars.length;
  const slotWidth = W / slots;
  const xs = bars.map((_, i) => (slotOf(i) + 0.5) * slotWidth);
  const x = (i: number) => xs[i];
  const barWidth = Math.min(27, Math.max(1.4, slotWidth * CANDLE_SHARE));
  const shownBars = spanMs ? aggregateCandles(bars, spanMs) : bars;
  const shownX = (i: number) => (spanMs ? ((shownBars[i].t + spanMs / 2 - start) / step) * slotWidth : x(i));
  const shownWidth = spanMs ? (spanMs / step) * slotWidth * CANDLE_SHARE : barWidth;

  // The line only draws closes, so fitting the axis to highs and lows would leave it half empty.
  const extremes = type === 'line' ? bars.map((bar) => bar.c) : bars.flatMap((bar) => [bar.l, bar.h]);
  if (shown.bb && has.bb) bands.forEach((band) => band && extremes.push(band.lower, band.upper));
  const scale = scaleOf(extremes, 0.07);
  const y = (value: number) => yOf(value, scale, PLOT_H);
  const ticks = niceTicks(scale.min, scale.max);

  const line = curvePath(bars.map((bar) => bar.c), x, y);
  const upper = runs(bands.map((band) => band && band.upper), x, y);
  const lower = runs(bands.map((band) => band && band.lower), x, y);

  return {
    intraday, bars, barSlots: spanMs ? (slots * step) / spanMs : slots, sma20, sma50, bands, rsi14, has, xs, ticks, scale, slots, slotWidth, step, start,
    paths: {
      grid: ticks.map((v) => `M0 ${y(v).toFixed(1)}H${W}`).join(''),
      line,
      area: `${line}L${x(last).toFixed(1)} ${PLOT_H}L${x(0).toFixed(1)} ${PLOT_H}Z`,
      candles: type === 'candles' ? candlePaths(shownBars, shownX, y, shownWidth) : null,
      bbUpper: upper.map((run) => smoothPath(run)).join(''),
      bbLower: lower.map((run) => smoothPath(run)).join(''),
      bbArea: bandArea(upper, lower),
      sma20: curvePath(sma20, x, y),
      sma50: curvePath(sma50, x, y),
      volume: volumePaths(shownBars, shownX, shownWidth),
      rsi: curvePath(rsi14, x, rsiY),
    },
  };
}

type Chart = ReturnType<typeof buildChart>;
type Paths = Chart['paths'];

function axisLabels(chart: Chart, range: History['range'], narrow: boolean, f: Format) {
  const { intraday, bars, ticks, slots, step, start } = chart;
  const date = (time: number) => {
    if (intraday) return f.time(time);
    if (range === '5Y') return f.month(time, true);
    if (range === '1Y') return f.month(time);
    return f.dateShort(time, 'UTC');
  };
  const at = (share: number, time: number) => ({ share, text: date(time) });
  const count = Math.min(narrow ? 3 : 6, slots);
  const x = intraday
    ? timeTicks(start, start + (slots - 1) * step, narrow ? 4 : 7).map((time) => at(((time - start) / step + 0.5) / slots, time))
    : Array.from({ length: count }, (_, k) => {
        const slot = Math.floor(((k + 0.5) * slots) / count);
        return at((slot + 0.5) / slots, bars[slot].t);
      });

  const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const decimals = tickStep >= 10 ? 0 : tickStep >= 1 ? 1 : tickStep >= 0.01 ? 2 : 3;
  const close = bars[bars.length - 1].c;
  // Index levels in the tens of thousands would not fit the axis with decimals.
  return { x, y: ticks.map((v) => f.num(v, decimals)), last: close >= 10_000 ? f.num(close, 0) : f.price(close) };
}

interface MainProps {
  paths: Paths;
  shown: Pick<Record<Indicator, boolean>, 'sma20' | 'sma50' | 'bb'>;
  tone: string;
  thin: boolean;
  label: string;
}

const MainSvg = memo(function MainSvg({ paths, shown, tone, thin, label }: MainProps) {
  const fadeId = `fade${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${PLOT_H}`} preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label={label} style={svgStyle}>
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: tone, stopOpacity: 0.2 }} />
          <stop offset="1" style={{ stopColor: tone, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={paths.grid} style={gridStyle} />
      {shown.bb && (
        <>
          <path d={paths.bbArea} style={{ fill: 'var(--sel)', opacity: 0.6 }} />
          <path className="sl lbb" d={paths.bbUpper} />
          <path className="sl lbb" d={paths.bbLower} />
        </>
      )}
      {paths.candles ? (
        <>
          <path className="cu" d={paths.candles.up} />
          <path className="cd" d={paths.candles.down} />
        </>
      ) : (
        <>
          <path d={paths.area} style={{ fill: `url(#${fadeId})` }} />
          <path className="sl" d={paths.line} style={{ stroke: tone, strokeWidth: thin ? 1.5 : 2 }} />
        </>
      )}
      {shown.sma50 && <path className="sl l50" d={paths.sma50} />}
      {shown.sma20 && <path className="sl l20" d={paths.sma20} />}
    </svg>
  );
});

const VolumeSvg = memo(function VolumeSvg({ paths, solid }: { paths: Paths; solid: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${VOLUME_H}`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={svgStyle}>
      <path className={solid ? 'vbar up' : 'cu'} d={paths.volume.up} />
      <path className={solid ? 'vbar dn' : 'cd'} d={paths.volume.down} style={{ opacity: 0.8 }} />
    </svg>
  );
});

const RsiSvg = memo(function RsiSvg({ paths }: { paths: Paths }) {
  return (
    <svg viewBox={`0 0 ${W} ${RSI_H}`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style={svgStyle}>
      <path d={`M0 ${rsiY(70)}H${W}M0 ${rsiY(30)}H${W}`} style={{ ...gridStyle, stroke: 'var(--ink3)', strokeDasharray: '2 4' }} />
      <path className="sl" d={paths.rsi} style={{ strokeWidth: 1.25 }} />
    </svg>
  );
});

export function ChartPlot({ history, exchange, type, shown, label, valueLabel }: Props) {
  const { t } = useT();
  const { lang } = useSettings();
  // Formatting builds Intl formatters, so the axis labels are made once, not on every hover.
  const f = useMemo(() => createFormat(lang), [lang]);
  const plot = useRef<HTMLDivElement>(null);
  const plotWidth = useWidth(plot);

  const spanMs = barSpan(history, exchange, plotWidth);
  const chart = useMemo(() => buildChart(history, exchange, type, shown, spanMs), [history, exchange, type, shown, spanMs]);
  const { intraday, bars, sma20, sma50, bands, rsi14, has, xs, ticks, scale, slotWidth, paths } = chart;
  const drawn = useMemo(() => ({ sma20: shown.sma20 && has.sma20, sma50: shown.sma50 && has.sma50, bb: shown.bb && has.bb }), [shown, has]);
  const names = { sma20: 'SMA 20', sma50: 'SMA 50', bb: t('stock.bb') };
  const missing = (['sma20', 'sma50', 'bb'] as const).filter((id) => shown[id] && !has[id]).map((id) => names[id]);
  const last = bars.length - 1;
  const percentY = (value: number) => `${100 - ((value - scale.min) / (scale.max - scale.min)) * 100}%`;


  const base = history.prevClose ?? bars[0].c;
  const tone = toneOf(bars[last].c - base);

  const barDate = (time: number) => (intraday ? f.time(time) : f.date(time, 'UTC'));

  const shares = useMemo(() => xs.map((x) => x / W), [xs]);
  const selection = useChartSelection(shares, slotWidth / W);
  const markOf = (i: number | null): Mark | null =>
    i === null ? null : { t: bars[i].t, c: bars[i].c, left: (xs[i] / W) * 100, top: parseFloat(percentY(bars[i].c)) };
  const marks = { hover: markOf(selection.hover), anchor: markOf(selection.anchor), price: f.price, date: barDate };

  const active = selection.hover ?? selection.anchor ?? last;
  const bar = bars[active];
  const before = history.candles[history.warmup + active - 1]?.c ?? history.prevClose;
  const change = before ? (bar.c / before - 1) * 100 : null;

  const axes = useMemo(() => axisLabels(chart, history.range, plotWidth > 0 && plotWidth < 480, f), [chart, history.range, plotWidth, f]);

  return (
    <div>
      <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', minHeight: 20, fontSize: 12, color: 'var(--ink2)' }}>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{barDate(bar.t)}</span>
        {valueLabel ? (
          <span>{valueLabel} {f.price(bar.c)}</span>
        ) : (
          <>
            <span>{t('stock.o')} {f.price(bar.o)}</span>
            <span>{t('stock.h')} {f.price(bar.h)}</span>
            <span>{t('stock.l')} {f.price(bar.l)}</span>
            <span>{t('stock.c')} {f.price(bar.c)}</span>
          </>
        )}
        <span className={direction(change)} style={{ fontWeight: 500 }}>{f.pct(change)}</span>
        {drawn.sma20 && <span style={{ color: 'var(--brass)' }}>SMA 20 {f.price(sma20[active])}</span>}
        {drawn.sma50 && <span>SMA 50 {f.price(sma50[active])}</span>}
        {drawn.bb && (
          <span style={{ color: 'var(--ink3)' }}>
            {t('stock.bb')} {bands[active] ? `${f.price(bands[active].lower)}–${f.price(bands[active].upper)}` : DASH}
          </span>
        )}
        {missing.length > 0 && (
          <span style={{ color: 'var(--ink3)' }}>
            {t('stock.noData', { name: missing.join(', ') })}
          </span>
        )}
      </div>

      <SelectionReadout {...marks} />

      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <div ref={plot} className="plot-main" style={{ position: 'relative', flex: 1, minWidth: 0, borderTop: '1px solid var(--hair)', borderBottom: '1px solid var(--ink3)' }}>
          <MainSvg paths={paths} shown={drawn} tone={tone} thin={bars.length > DENSE_POINTS} label={label} />
          {type === 'line' && bars.length < SMOOTH_MIN && bars.slice(0, last).map((bar, i) => (
            <span key={bar.t} className="pt-dot" aria-hidden="true" style={{ left: `${(xs[i] / W) * 100}%`, top: percentY(bar.c), background: tone }} />
          ))}
          {type === 'line' && (
            <span
              className={intraday && history.session?.kind !== 'previous' ? 'live' : undefined}
              aria-hidden="true"
              style={{
                position: 'absolute', left: `${(xs[last] / W) * 100}%`, top: percentY(bars[last].c), width: 10, height: 10,
                margin: '-5px 0 0 -5px', borderRadius: '50%', background: tone, boxShadow: '0 0 0 3px var(--paper)',
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
          {ticks.map((v, k) => (
            <span key={v} style={{ position: 'absolute', left: 4, top: percentY(v), transform: 'translateY(-50%)' }}>{axes.y[k]}</span>
          ))}
          <span style={{ position: 'absolute', left: 0, right: 0, top: percentY(bars[last].c), transform: 'translateY(-50%)', padding: '1px 4px', borderRadius: 4, fontWeight: 600, background: 'var(--ink)', color: 'var(--paper)' }}>
            {axes.last}
          </span>
        </div>
      </div>

      {shown.vol && bars.some((b) => b.v !== null) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, height: VOLUME_H, borderBottom: '1px solid var(--hair)' }}>
            <VolumeSvg paths={paths} solid={plotWidth / chart.barSlots < SOLID_BAR_PX} />
            <span className="lbl" style={subLabelStyle}>
              {t('stock.vol')} · <span className="num" style={{ color: 'var(--ink)', textTransform: 'none' }}>{f.big(bar.v)}</span>
            </span>
          </div>
          <div style={{ flex: 'none', width: AXIS_WIDTH }} />
        </div>
      )}
      {shown.vol && bars.every((b) => b.v === null) && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink3)' }}>
          <span className="lbl">{t('stock.vol')}</span> · {t('stock.volNone')}
        </p>
      )}

      {shown.rsi && (
        <div style={{ marginTop: 10 }}>
          {/* Above the panel rather than over it, where it would hide a line near 100. */}
          <span className="lbl" style={{ display: 'block' }}>
            RSI 14{has.rsi && <> · <span className="num" style={{ color: 'var(--ink)' }}>{f.num(rsi14[active], 1)}</span></>}
          </span>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0, height: RSI_H, borderBottom: '1px solid var(--hair)' }}>
              {has.rsi ? <RsiSvg paths={paths} /> : <p className="ind-none">{t('stock.noData', { name: 'RSI 14' })}</p>}
            </div>
            <div className="num" aria-hidden="true" style={{ position: 'relative', flex: 'none', width: AXIS_WIDTH, height: RSI_H, fontSize: 11, color: 'var(--ink3)' }}>
              {has.rsi && [70, 30].map((level) => (
                <span key={level} style={{ position: 'absolute', left: 4, top: rsiTop(level), transform: 'translateY(-50%)' }}>{level}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="num x-dates" aria-hidden="true" style={{ position: 'relative', height: 20, margin: `8px ${AXIS_WIDTH + 10}px 0 0`, fontSize: 11, color: 'var(--ink3)' }}>
        {axes.x.map((item) => (
          <span key={item.share} style={{ position: 'absolute', left: `${Math.min(96, Math.max(4, item.share * 100))}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{item.text}</span>
        ))}
      </div>
    </div>
  );
}
