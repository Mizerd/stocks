import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { INDICES, STOCKS } from '../../shared/catalog';
import type { ProviderStatus } from '../../shared/types';
import { ConfirmBar } from '../components/ConfirmBar';
import { PanelTitle } from '../components/ui';
import { brand } from '../config/brand';
import { useT } from '../i18n';
import { useApi } from '../lib/api';
import { useFormat } from '../lib/format';
import { deleteBrowserData } from '../lib/myList';
import { useListings } from '../lib/universe';
import { usePageTitle } from '../lib/usePageTitle';

// Which provider check belongs to each row of the sources table.
const ROW_PROVIDERS: ProviderStatus['provider'][] = ['nasdaq', 'nordic', 'euronext', 'baltic', 'pensionikeskus', 'ecb'];

type DeleteStep = 'idle' | 'asking' | 'done';

function Privacy() {
  const { t, list } = useT();
  const [step, setStep] = useState<DeleteStep>('idle');
  return (
    <section className="pnl" id="privacy">
      <PanelTitle>{t('common.privTitle')}</PanelTitle>
      <div className="prv">
        <p>{t('common.privLead')}</p>
        <h3>{t('common.privStoredH')}</h3>
        <p>{t('common.privStored')}</p>
        <ul>{list('common.privItems').map((item) => <li key={item}>{item}</li>)}</ul>
        <p>{t('common.privLocal')}</p>
        <p>{t('common.privKeep')}</p>
        <div style={{ marginTop: 14 }}>
          {step === 'asking' ? (
            <ConfirmBar
              question={t('common.privDeleteAsk')}
              confirmLabel={t('common.privDeleteYes')}
              onConfirm={() => {
                deleteBrowserData();
                setStep('done');
              }}
              onCancel={() => setStep('idle')}
            />
          ) : (
            <button type="button" className="btn" onClick={() => setStep('asking')}>{t('common.privDelete')}</button>
          )}
          <p role="status">{step === 'done' && t('common.privDeleted')}</p>
        </div>
        <h3>{t('common.privServerH')}</h3>
        <p>{t('common.privServer')}</p>
        {brand.contactEmail && <p>{t('common.privContact', { email: brand.contactEmail })}</p>}
      </div>
    </section>
  );
}

export function About() {
  const { t, table } = useT();
  const f = useFormat();
  const universe = useListings();
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
    <main className="wrap page">
      <h1 className="ser h1" style={{ marginBottom: 8 }}>{t('common.aboutTitle')}</h1>
      <section className="pnl">
        <p style={{ margin: '0 0 14px', maxWidth: '68ch', color: 'var(--ink2)', lineHeight: 1.6 }}>
          {t('common.srcNote', { n: f.num(universe?.filter((i) => i.kind === 'stock').length || STOCKS.length, 0), k: f.num(universe?.filter((i) => i.kind === 'fund').length ?? 0, 0), m: INDICES.length })}
        </p>
        <div className="src">
          <div className="lbl tbl-head src-cols">
            <span>{t('common.srcMarket')}</span>
            <span>{t('common.srcSource')}</span>
            <span>{t('common.srcFresh')}</span>
            <span>{t('common.srcStatus')}</span>
          </div>
          {table('common.srcRows').map(([market, source, freshness], i) => (
            <div key={market} className="tbl-row src-cols" style={{ padding: '8px' }}>
              <span style={{ fontWeight: 600 }}>{market}</span>
              <span>{source}</span>
              <span style={{ color: 'var(--ink2)' }}>{freshness}</span>
              <span role="status" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{statusText(ROW_PROVIDERS[i])}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="pnl" id="keys">
        <PanelTitle>{t('common.keysTitle')}</PanelTitle>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 18px', margin: '14px 0 0' }}>
          {[['/', 'common.keySearch'], ['Enter', 'common.keyEnter'], ['Esc', 'common.keyEsc']].map(([key, label]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt><kbd className="num" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, border: '1px solid var(--hair)', borderRadius: 6, padding: '3px 8px' }}>{key}</kbd></dt>
              <dd style={{ margin: 0 }}>{t(label)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Privacy />
    </main>
  );
}
