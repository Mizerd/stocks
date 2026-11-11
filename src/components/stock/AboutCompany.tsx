import { EXCHANGES } from '../../../shared/exchanges';
import type { StockDetail } from '../../../shared/types';
import { useT } from '../../i18n';
import { useAbout } from '../../lib/api';
import { shortSummary } from '../../lib/text';
import { LeaderRow } from './LeaderRow';

const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const textStyle = { margin: '0 0 6px', maxWidth: '68ch', color: 'var(--ink2)', lineHeight: 1.6, textWrap: 'pretty' } as const;

// A few sentences about the company: Wikipedia in the reader's language, else the exchange's own text.
function Summary({ detail }: { detail: StockDetail }) {
  const { t, lang } = useT();
  const about = useAbout(detail.summary.symbol, lang);

  if (about.loading) {
    return (
      <div role="status" aria-label={t('common.loading')} style={{ display: 'grid', gap: 12, padding: '6px 0 16px' }}>
        {[100, 94, 62].map((width) => <span key={width} className="skel" style={{ width: `${width}%`, height: 8 }} />)}
      </div>
    );
  }
  if (about.data && !('unavailable' in about.data)) {
    const { extract, url, lang: textLang } = about.data;
    return (
      <>
        <p lang={textLang} style={textStyle}>{shortSummary(extract)}</p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink3)' }}>
          {t('stock.aboutSource')}: <a className="src-link" href={url} target="_blank" rel="noreferrer">{t('stock.aboutWiki')}</a>,{' '}
          <a className="src-link" href={LICENCE_URL} target="_blank" rel="noreferrer license">CC BY-SA 4.0</a>
        </p>
      </>
    );
  }
  if (detail.description) {
    return (
      <>
        <p lang="en" style={textStyle}>{shortSummary(detail.description)}</p>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink3)' }}>{t('stock.aboutSource')}: Nasdaq</p>
      </>
    );
  }
  return null;
}

export function AboutCompany({ detail }: { detail: StockDetail }) {
  const { t } = useT();
  const { summary } = detail;

  const facts = [
    { key: 'sector', value: summary.sector ? t(`stock.sec.${summary.sector}`) : null },
    { key: 'industry', value: detail.industry },
    { key: 'exchange', value: EXCHANGES[summary.exchange].name },
    { key: 'currency', value: summary.currency },
    { key: 'isin', value: detail.isin },
  ];

  return (
    <>
      <h2 className="ser pnl-title" style={{ marginBottom: 8 }}>{t('stock.about')}</h2>
      <Summary detail={detail} />
      {facts.map((fact) => fact.value && (
        <LeaderRow key={fact.key} label={t(`stock.facts.${fact.key}`)} padding={5}>{fact.value}</LeaderRow>
      ))}
    </>
  );
}
