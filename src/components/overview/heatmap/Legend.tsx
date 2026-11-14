import { useT } from '../../../i18n';
import { EDGES, type Step } from '../../../lib/heatmap';
import { useFormat } from '../../../lib/format';

const STEPS: Step[] = ['d6', 'd5', 'd4', 'd3', 'd2', 'd1', 'flat', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
// Edges of the scale from −3 up to +3, each with its place in swatch widths from the left; 0 sits under the flat swatch.
const TICKS = [
  ...[...EDGES].reverse().map((edge, i) => ({ value: -edge, at: i + 1 })),
  { value: 0, at: 6.5 },
  ...EDGES.map((edge, i) => ({ value: edge, at: i + 8 })),
];

export function Legend() {
  const { t } = useT();
  const f = useFormat();
  const tick = (value: number) => f.signed(value, 0, 2);
  // Hidden text for screen readers: what range of moves each swatch stands for.
  const range = (i: number) => {
    if (STEPS[i] === 'flat') return f.pct(0);
    const level = i < 6 ? 6 - i : i - 6;
    const low = [0, ...EDGES][level - 1];
    const high = [...EDGES, Infinity][level - 1];
    if (high === Infinity) return t(i < 6 ? 'heatmap.below' : 'heatmap.above', { v: tick(i < 6 ? -low : low) });
    return i < 6 ? t('heatmap.range', { from: tick(-high), to: tick(-low) }) : t('heatmap.range', { from: tick(low), to: tick(high) });
  };
  return (
    <div className="hm-legend">
      <div className="hm-scale">
        <p className="hm-cap">{t('heatmap.legend')}</p>
        <div className="hm-swatches">
          {STEPS.map((step, i) => (
            <span key={step} className={`hm-${step}`}>
              <span className="sr">{range(i)}</span>
            </span>
          ))}
        </div>
        <div className="hm-ticks num" aria-hidden="true">
          {TICKS.map(({ value, at }) => (
            <span key={value} className={Math.abs(value) === 0.25 || Math.abs(value) === 0.5 ? 'minor' : undefined} style={{ left: `${(at / 13) * 100}%` }}>
              {tick(value)}
            </span>
          ))}
        </div>
      </div>
      <p className="hm-nt">
        <span className="hm-none" aria-hidden="true" />
        {t('heatmap.noTrades')}
      </p>
    </div>
  );
}
