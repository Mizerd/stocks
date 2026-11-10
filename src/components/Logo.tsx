import { Link } from 'react-router-dom';
import { brand } from '../config/brand';
import { useSettings } from '../settings';

export function Logo() {
  const { lang } = useSettings();
  const { outline, detail, dot } = brand.logo;
  return (
    <Link to="/" aria-label={brand.name} className="logo">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d={outline} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinejoin: 'round' }} />
        <path d={detail} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinecap: 'round' }} />
        <circle cx={dot.cx} cy={dot.cy} r={dot.r} style={{ fill: 'var(--gild)' }} />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ser logo-name">{brand.name}</span>
        <span className="ser logo-tag">{brand.tagline[lang]}</span>
      </span>
    </Link>
  );
}
