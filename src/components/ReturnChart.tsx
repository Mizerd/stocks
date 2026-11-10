import { seriesPath, yOf } from '../lib/chart';
import { useFormat } from '../lib/format';
import { niceTicks } from '../lib/indicators';

const WIDTH = 1000;
const HEIGHT = 300;
const AXIS_WIDTH = 56;
const AXIS_GAP = 10;

// The four lines differ by pattern as well as colour, so they can be told apart without colour.
const LINE_STYLES = [
  { stroke: 'var(--ink)' },
  { stroke: 'var(--brass)' },
  { stroke: 'var(--ink)', strokeDasharray: '7 4' },
  { stroke: 'var(--brass)', strokeDasharray: '2 4' },
];

// CSS borders that draw the matching legend swatch for line 0 to 3.
export const LINE_SWATCHES = [
  '2px solid var(--ink)',
  '2px solid var(--brass)',
  '2px dashed var(--ink)',
  '2px dotted var(--brass)',
];

interface ReturnChartProps {
  // Shared time axis; every series has one value per time, null where it has none.
  times: number[];
  series: { label: string; values: (number | null)[] }[];
  ariaLabel: string;
  formatX(time: number): string;
  height?: number;
  xLabels?: number;
}

export function ReturnChart({ times, series, ariaLabel, formatX, height = 300, xLabels = 6 }: ReturnChartProps) {
  const f = useFormat();

  const values = series.flatMap((s) => s.values).filter((v) => v !== null);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (max - min < 1) {
    min = -5;
    max = 5;
  }
  const pad = (max - min) * 0.1;
  const scale = { min: min - pad, max: max + pad };
  const ticks = niceTicks(scale.min, scale.max, 5);
  const decimals = ticks.length > 1 && ticks[1] - ticks[0] < 1 ? 1 : 0;
  const gridPath = ticks.filter((v) => v !== 0).map((v) => `M0 ${yOf(v, scale, HEIGHT).toFixed(1)}H${WIDTH}`).join('');

  const last = times.length - 1;
  const labelCount = Math.min(xLabels, times.length);
  const labelIndexes = Array.from({ length: labelCount }, (_, i) => Math.round(((i + 0.5) / labelCount) * last));

  return (
    <div>
      <div style={{ display: 'flex', gap: AXIS_GAP }}>
        <div
          role="img"
          aria-label={ariaLabel}
          style={{ position: 'relative', flex: 1, minWidth: 0, height, borderBottom: '1px solid var(--ink)' }}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, display: 'block' }}
          >
            <path d={gridPath} style={{ fill: 'none', stroke: 'var(--hair)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }} />
            <path
              d={`M0 ${yOf(0, scale, HEIGHT).toFixed(1)}H${WIDTH}`}
              style={{ fill: 'none', stroke: 'var(--ink3)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }}
            />
            {series.map((s, i) => (
              <path
                key={s.label}
                className="sl"
                d={seriesPath(s.values, scale, WIDTH, HEIGHT)}
                style={{ strokeWidth: 2, ...LINE_STYLES[i % LINE_STYLES.length] }}
              />
            ))}
          </svg>
        </div>
        <div className="num" style={{ position: 'relative', flex: 'none', width: AXIS_WIDTH, height, fontSize: 11, color: 'var(--ink3)' }}>
          {ticks.map((v) => (
            <span
              key={v}
              style={{ position: 'absolute', left: 4, top: `${yOf(v, scale, 100)}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
            >
              {f.pct(v, decimals)}
            </span>
          ))}
        </div>
      </div>
      <div
        className="num"
        style={{ position: 'relative', height: 20, margin: `6px ${AXIS_WIDTH + AXIS_GAP}px 0 0`, fontSize: 11, color: 'var(--ink3)' }}
      >
        {labelIndexes.map((index) => (
          <span
            key={index}
            style={{ position: 'absolute', left: `${last > 0 ? (index / last) * 100 : 50}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          >
            {formatX(times[index])}
          </span>
        ))}
      </div>
    </div>
  );
}
