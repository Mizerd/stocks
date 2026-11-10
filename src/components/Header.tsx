import { NavLink, useLocation } from 'react-router-dom';
import { EXCHANGES, tradingDayOfYear } from '../../shared/exchanges';
import { useT } from '../i18n';
import { useFormat } from '../lib/format';
import { useNow } from '../lib/useNow';
import { useSettings } from '../settings';
import { Logo } from './Logo';
import { Search } from './Search';
import { SessionWidget } from './SessionWidget';

function UtilityBar() {
  const { t } = useT();
  const f = useFormat();
  const now = useNow();
  const { lang, setLang, colorBlind, toggleTheme, toggleColorBlind } = useSettings();

  return (
    <div
      className="wrap"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 24px',
        paddingTop: 10, paddingBottom: 10, fontSize: 12, color: 'var(--ink2)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <span>{f.longDate(now)}</span>
        <span style={{ color: 'var(--ink3)' }}>{t('common.dayno', { n: tradingDayOfYear(EXCHANGES.XLIT, now) })}</span>
      </div>
      <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11.5 }}>
        <span>Vilnius {f.time(now, 'Europe/Vilnius')}</span>
        <span>{t('common.lon')} {f.time(now, 'Europe/London')}</span>
        <span>{t('common.ny')} {f.time(now, 'America/New_York')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="seg" role="group" aria-label={t('common.langLabel')}>
          <button className={lang === 'lt' ? 'on' : ''} aria-pressed={lang === 'lt'} onClick={() => setLang('lt')}>LT</button>
          <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        </div>
        <button className="icon-btn" aria-label={t('common.cbLabel')} title={t('common.cbLabel')} aria-pressed={colorBlind} onClick={toggleColorBlind}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }} />
            <circle cx="8" cy="8" r="2" style={{ fill: 'currentColor' }} />
          </svg>
        </button>
        <button className="icon-btn" aria-label={t('common.themeLabel')} title={t('common.themeLabel')} onClick={toggleTheme}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.5 }} />
            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" style={{ fill: 'var(--ink)' }} />
          </svg>
        </button>
      </div>
    </div>
  );
}

function lastStock(): string {
  try {
    return localStorage.getItem('lastStock') ?? 'AAPL';
  } catch {
    return 'AAPL';
  }
}

export function Header() {
  const { t } = useT();
  const { pathname } = useLocation();
  const onStock = pathname.startsWith('/stock');

  return (
    <header>
      <UtilityBar />
      <div className="wrap"><div className="dbl" /></div>
      <div className="wrap" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 36px', paddingTop: 18, paddingBottom: 16 }}>
        <Logo />
        <Search />
        <SessionWidget />
      </div>
      <div className="wrap">
        <nav
          className="nav"
          aria-label={t('common.navLabel')}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '0 28px', borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}
        >
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'on' : '')}>{t('common.n1')}</NavLink>
          <NavLink to={`/stock/${lastStock()}`} className={onStock ? 'on' : ''} aria-current={onStock ? 'page' : undefined}>{t('common.n2')}</NavLink>
          <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'on' : '')}>{t('common.n3')}</NavLink>
          <NavLink to="/screener" className={({ isActive }) => (isActive ? 'on' : '')}>{t('common.n4')}</NavLink>
          <span className="nav-note" style={{ marginLeft: 'auto', alignSelf: 'center', padding: '6px 0', fontSize: 12, color: 'var(--ink3)' }}>
            {t('common.delay')}
          </span>
        </nav>
      </div>
    </header>
  );
}
