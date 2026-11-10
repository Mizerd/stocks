import { Link } from 'react-router-dom';
import { brand } from '../config/brand';
import { useSettings } from '../settings';

export function Logo() {
  const { lang } = useSettings();
  const { outline, detail, dot } = brand.logo;
  return (
    <Link to="/" aria-label={brand.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="38" height="38" viewBox="0 0 32 32" aria-hidden="true" style={{ flex: '0 0 auto' }}>
        <path d={outline} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinejoin: 'round' }} />
        <path d={detail} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinecap: 'round' }} />
        <circle cx={dot.cx} cy={dot.cy} r={dot.r} style={{ fill: 'var(--gild)' }} />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ser" style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1 }}>
          {brand.name}
        </span>
        <span className="ser" style={{ fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink2)' }}>
          {brand.tagline[lang]}
        </span>
      </span>
    </Link>
  );
}
