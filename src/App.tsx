import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Notice } from './components/ui';
import { useT } from './i18n';
import { About } from './pages/About';
import { Overview } from './pages/Overview';
import { Portfolio } from './pages/Portfolio';
import { Screener } from './pages/Screener';
import { Stock } from './pages/Stock';
import { SettingsProvider, useSettings } from './settings';

function NotFound() {
  const { t } = useT();
  return (
    <main className="wrap" style={{ paddingTop: 30, paddingBottom: 56 }}>
      <Notice height={260}>{t('common.notFoundH')}</Notice>
      <p style={{ textAlign: 'center' }}><Link to="/" className="btn">{t('common.backHome')}</Link></p>
    </main>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Shell() {
  const { theme, colorBlind } = useSettings();
  return (
    <div className={`vp${theme === 'dark' ? ' t-dark' : ''}${colorBlind ? ' cb' : ''}`} style={{ minHeight: '100vh' }}>
      <ScrollToTop />
      <Header />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/stock/:symbol" element={<Stock />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/screener" element={<Screener />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
