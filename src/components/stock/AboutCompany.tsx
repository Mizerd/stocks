import { EXCHANGES } from '../../../shared/exchanges';
import type { StockDetail } from '../../../shared/types';
import { useT } from '../../i18n';
import { LeaderRow } from './LeaderRow';

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
      <h2 className="ser" style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500 }}>{t('stock.about')}</h2>
      {/* The source writes descriptions in English only. */}
      {detail.description && (
        <p lang="en" style={{ margin: '0 0 8px', color: 'var(--ink2)', textWrap: 'pretty' }}>{detail.description}</p>
      )}
      {facts.map((fact) => fact.value && (
        <LeaderRow key={fact.key} label={t(`stock.facts.${fact.key}`)} padding={5}>{fact.value}</LeaderRow>
      ))}
    </>
  );
}
