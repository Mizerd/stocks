import { useT } from '../../i18n';
import { Notice, PanelTitle } from '../ui';

// A point on the dial: value 0 is far left, 100 far right.
function onDial(value: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - value / 100);
  return [100 + radius * Math.cos(angle), 100 - radius * Math.sin(angle)];
}

export function Barometer({ value, count }: { value: number | null; count: number }) {
  const { t, list } = useT();
  const zones = list('overview.baroL');

  if (value === null) {
    return (
      <section className="pnl">
        <PanelTitle small>{t('overview.baro')}</PanelTitle>
        <Notice>{t('common.unavailable')}</Notice>
      </section>
    );
  }

  const zone = Math.min(4, Math.floor(value / 20));
  const [arcFromX, arcFromY] = onDial(zone * 20, 70);
  const [arcToX, arcToY] = onDial(zone * 20 + 20, 70);
  const [needleX, needleY] = onDial(value, 74);

  return (
    <section className="pnl">
      <PanelTitle small>{t('overview.baro')}</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10 }}>
        <svg viewBox="0 0 200 108" role="img" aria-label={t('overview.baroAria', { n: value, name: zones[zone] })} style={{ width: '100%', maxWidth: 260, height: 'auto' }}>
          <path d="M12 100A88 88 0 0 1 188 100" style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.5 }} />
          <path d="M20 100A80 80 0 0 1 180 100" style={{ fill: 'none', stroke: 'var(--ink2)', strokeWidth: 6, strokeDasharray: '1 11.566' }} />
          <path d="M22 100A78 78 0 0 1 178 100" style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 11, strokeDasharray: '1.6 59.66' }} />
          <path d={`M${arcFromX.toFixed(1)} ${arcFromY.toFixed(1)}A70 70 0 0 1 ${arcToX.toFixed(1)} ${arcToY.toFixed(1)}`} style={{ fill: 'none', stroke: 'var(--gild)', strokeWidth: 4 }} />
          <path d={`M100 100L${needleX.toFixed(1)} ${needleY.toFixed(1)}`} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 2, strokeLinecap: 'round' }} />
          <circle cx="100" cy="100" r="5.5" style={{ fill: 'var(--ink)' }} />
          <circle cx="100" cy="100" r="2" style={{ fill: 'var(--gild)' }} />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, width: '100%', maxWidth: 300, marginTop: 6, fontSize: 11 }}>
          {zones.map((name, i) => (
            <span key={name} style={i === zone ? { color: 'var(--ink)', fontWeight: 600 } : { color: 'var(--ink3)', fontWeight: 400 }}>
              {name}
            </span>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="num" style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</span>
          <span className="ser" style={{ fontSize: 20, fontStyle: 'italic' }}>{zones[zone]}</span>
        </p>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink2)', textWrap: 'pretty' }}>{t('overview.baroNote', { n: count })}</p>
    </section>
  );
}
