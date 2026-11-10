import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { INDICES, STOCKS } from '../../shared/catalog';
import type { ProviderStatus } from '../../shared/types';
import { PanelTitle } from '../components/ui';
import { useT } from '../i18n';
import { useApi } from '../lib/api';
import { usePageTitle } from '../lib/usePageTitle';

// Which provider check belongs to each row of the sources table.
const ROW_PROVIDERS: ProviderStatus['provider'][] = ['nasdaq', 'nordic', 'euronext', 'baltic', 'ecb'];
const COLUMNS = 'minmax(150px, 1.2fr) minmax(170px, 1.6fr) minmax(150px, 1.6fr) 110px';

export function About() {
  const { t, table } = useT();
  usePageTitle(t('common.aboutTitle'));
  const status = useApi<{ providers: ProviderStatus[] }>('/api/status');
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  function statusText(provider: ProviderStatus['provider']) {
    if (status.loading) return t('common.srcChecking');
    const check = status.data?.providers.find((p) => p.provider === provider);
    return check?.ok ? t('common.srcOk') : t('common.srcDown');
  }

  return (
    <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 30, paddingBottom: 56 }}>
      <h1 className="ser" style={{ margin: '0 0 12px', fontSize: 'clamp(34px, 3.6vw, 48px)', lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.015em' }}>
        {t('common.aboutTitle')}
      </h1>
      <section className="pnl">
        <p style={{ margin: '0 0 14px', maxWidth: '60em', color: 'var(--ink2)' }}>
          {t('common.srcNote', { n: STOCKS.length, m: INDICES.length })}
        </p>
        <div className="scroll-x">
          <div style={{ minWidth: 640 }}>
            <div className="lbl" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, padding: 8, borderBottom: '1px solid var(--ink)' }}>
              <span>{t('common.srcMarket')}</span>
              <span>{t('common.srcSource')}</span>
              <span>{t('common.srcFresh')}</span>
              <span>{t('common.srcStatus')}</span>
            </div>
            {table('common.srcRows').map(([market, source, freshness], i) => (
              <div key={market} style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 14, minHeight: 46, padding: '6px 8px', borderBottom: '1px solid var(--hair)' }}>
                <span style={{ fontWeight: 500 }}>{market}</span>
                <span>{source}</span>
                <span style={{ color: 'var(--ink2)' }}>{freshness}</span>
                <span role="status" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{statusText(ROW_PROVIDERS[i])}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="pnl" id="keys">
        <PanelTitle>{t('common.keysTitle')}</PanelTitle>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 18px', margin: '14px 0 0' }}>
          {[['/', 'common.keySearch'], ['Enter', 'common.keyEnter'], ['Esc', 'common.keyEsc']].map(([key, label]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt><kbd className="num" style={{ fontSize: 12, border: '1px solid var(--hair)', borderRadius: 2, padding: '2px 7px' }}>{key}</kbd></dt>
              <dd style={{ margin: 0 }}>{t(label)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
