import { Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Loading, Notice } from './components/ui';
import { useT } from './i18n';
import { About, Portfolio, Screener, Stock } from './pages/lazy';
import { Overview } from './pages/Overview';
import { SettingsProvider, useSettings } from './settings';

function NotFound() {
  const { t } = useT();
  return (
    <main className="wrap page">
      <Notice height={260}>{t('common.notFoundH')}</Notice>
      <p style={{ textAlign: 'center' }}><Link to="/" className="btn">{t('common.backHome')}</Link></p>
    </main>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// The browser bar on phones takes the page colour of the current theme.
function useThemeColor(root: React.RefObject<HTMLDivElement | null>, theme: string) {
  useEffect(() => {
    if (!root.current) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.append(meta);
    }
    meta.content = getComputedStyle(root.current).getPropertyValue('--paper').trim();
  }, [root, theme]);
}

function Shell() {
  const { theme, colorBlind } = useSettings();
  const root = useRef<HTMLDivElement>(null);
  useThemeColor(root, theme);
  return (
    <div ref={root} className={`vp${theme === 'dark' ? ' t-dark' : ''}${colorBlind ? ' cb' : ''}`} style={{ minHeight: '100dvh' }}>
      <ScrollToTop />
      <Header />
      <Suspense fallback={<main className="wrap page"><Loading height={420} /></main>}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/stock/:symbol" element={<Stock />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </SettingsProvider>
  );
}
