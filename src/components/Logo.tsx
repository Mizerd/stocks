import { useState } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../config/brand';
import { useT } from '../i18n';

export function Logo() {
  const { t, lang } = useT();
  const [ringing, setRinging] = useState(false);
  const { outline, detail, dot } = brand.logo;
  return (
    <div className="logo">
      <button className={`bell${ringing ? ' ringing' : ''}`} aria-label={t('common.ring')} onClick={() => setRinging(true)}>
        <svg viewBox="0 0 32 32" aria-hidden="true" onAnimationEnd={() => setRinging(false)}>
          <path d={outline} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinejoin: 'round' }} />
          <path d={detail} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinecap: 'round' }} />
          <circle className="clapper" cx={dot.cx} cy={dot.cy} r={dot.r} style={{ fill: 'var(--gild)' }} />
        </svg>
      </button>
      <Link to="/" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="ser logo-name">{brand.name}</span>
        <span className="ser logo-tag">{brand.tagline[lang]}</span>
      </Link>
    </div>
  );
}
