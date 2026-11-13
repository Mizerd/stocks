import { useEffect, useRef, useState, type ReactNode } from 'react';
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

  return (
    <div className="wrap hdr-util">
      <div className="hdr-when">
        <span>{f.longDate(now)}</span>
        <span style={{ color: 'var(--ink3)' }}>{t('common.dayno', { n: tradingDayOfYear(EXCHANGES.XLIT, now) })}</span>
      </div>
      <div className="hdr-when num">
        <span>Vilnius {f.time(now, 'Europe/Vilnius')}</span>
        <span>{t('common.lon')} {f.time(now, 'Europe/London')}</span>
        <span>{t('common.ny')} {f.time(now, 'America/New_York')}</span>
      </div>
    </div>
  );
}

function Tools() {
  const { t } = useT();
  const { lang, setLang, colorBlind, toggleTheme, toggleColorBlind } = useSettings();
  return (
    <div className="hdr-tools">
      <div className="seg" role="group" aria-label={t('common.langLabel')}>
        <button className={lang === 'lt' ? 'on' : ''} aria-pressed={lang === 'lt'} onClick={() => setLang('lt')}>LT</button>
        <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      </div>
      <button className="icon-btn" aria-label={t('common.cbLabel')} title={t('common.cbLabel')} aria-pressed={colorBlind} onClick={toggleColorBlind}>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }} />
          <circle cx="8" cy="8" r="2" style={{ fill: 'currentColor' }} />
        </svg>
      </button>
      <button className="icon-btn" aria-label={t('common.themeLabel')} title={t('common.themeLabel')} onClick={toggleTheme}>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }} />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" style={{ fill: 'currentColor' }} />
        </svg>
      </button>
    </div>
  );
}

// Phones: language, theme and palette behind a "⋯" button.
function Menu() {
  const { t } = useT();
  const { lang, setLang, theme, colorBlind, toggleTheme, toggleColorBlind } = useSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Closes on Escape, or when a tap or the keyboard focus lands outside it.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="hdr-menu" ref={box}>
      <button ref={button} className="icon-btn" aria-label={t('common.menu')} aria-expanded={open} aria-controls="hdr-pop" onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{ fill: 'currentColor' }}>
          <circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div id="hdr-pop" className="hdr-pop">
          <div className="seg" role="group" aria-label={t('common.langLabel')}>
            <button className={lang === 'lt' ? 'on' : ''} aria-pressed={lang === 'lt'} onClick={() => setLang('lt')}>Lietuvių</button>
            <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          </div>
          <button className="hdr-sw" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme}>
            {t('common.dark')}<span className="sw" aria-hidden="true" />
          </button>
          <button className="hdr-sw" role="switch" aria-checked={colorBlind} onClick={toggleColorBlind}>
            {t('common.cbLabel')}<span className="sw" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// Tab icons, shown only in the phone tab bar.
const ICONS: ReactNode[] = [
  <path key="o" d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  <path key="s" d="M3 17l5-6 4 3 6-8 3 3M3 21h18" />,
  <path key="l" d="M6.5 3.5h11v17L12 16.5l-5.5 4z" />,
  <path key="c" d="M4 7h9M17 7h3M4 17h3M11 17h9M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
];

function lastStock(): string {
  try {
    return sessionStorage.getItem('lastStock') ?? 'AAPL';
  } catch {
    return 'AAPL';
  }
}

export function Header() {
  const { t, list } = useT();
  const { pathname } = useLocation();
  const onStock = pathname.startsWith('/stock');
  const short = list('common.navShort');
  const [searching, setSearching] = useState(false);
  const tabs = [
    { to: '/', label: t('common.n1') },
    { to: `/stock/${lastStock()}`, label: t('common.n2') },
    { to: '/portfolio', label: t('common.n3') },
    { to: '/screener', label: t('common.n4') },
  ];

  return (
    <header>
      <UtilityBar />
      <div className="wrap">
        <div className={`hdr-main${searching ? ' searching' : ''}`}>
          <Logo />
          <SessionWidget />
          <Search expanded={searching} onExpandedChange={setSearching} />
          <Tools />
          <Menu />
        </div>
      </div>
      <div className="wrap">
        <nav className="nav" aria-label={t('common.navLabel')}>
          <div className="tabs">
            {tabs.map((tab, i) => (
              <NavLink
                key={i}
                to={tab.to}
                end={i === 0}
                className={({ isActive }) => ((i === 1 ? onStock : isActive) ? 'on' : '')}
                aria-current={i === 1 && onStock ? 'page' : undefined}
              >
                <svg className="tab-ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{ICONS[i]}</svg>
                <span className="tab-full">{tab.label}</span>
                <span className="tab-short">{short[i]}</span>
              </NavLink>
            ))}
          </div>
          <p className="nav-note">{t('common.delay')}</p>
        </nav>
      </div>
    </header>
  );
}
