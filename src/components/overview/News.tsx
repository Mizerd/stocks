import type { NewsItem } from '../../../shared/types';
import { useT } from '../../i18n';
import { PanelTitle } from '../ui';

function useAgo() {
  const { t } = useT();
  return (time: string) => {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(time).getTime()) / 60000));
    if (minutes < 60) return t('overview.ago.min', { n: minutes });
    if (minutes < 60 * 24) return t('overview.ago.h', { n: Math.round(minutes / 60) });
    return t('overview.ago.d', { n: Math.round(minutes / 1440) });
  };
}

export function News({ items }: { items: NewsItem[] }) {
  const { t, lang } = useT();
  const ago = useAgo();
  if (items.length === 0) return null;
  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{t('overview.news')}</PanelTitle>
        <a href={`https://nasdaqbaltic.com/statistics/${lang}/news`} target="_blank" rel="noreferrer" className="link">
          {t('overview.allNews')}
        </a>
      </div>
      {/* Eight stories fill two rows on wide screens; narrower screens show the first four. */}
      <div className="news">
        {items.slice(0, 8).map((item) => (
          <article key={item.link} style={{ borderTop: '1px solid var(--hair)', paddingTop: 14 }}>
            <p className="lbl" style={{ margin: '0 0 8px', color: 'var(--brass)' }}>{item.issuer}</p>
            <h3 className="ser" style={{ margin: 0, fontSize: 20, lineHeight: 1.25, fontWeight: 500, textWrap: 'pretty' }}>
              <a href={item.link} target="_blank" rel="noreferrer" className="hl">{item.title}</a>
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink3)' }}>{ago(item.time)} · {t('overview.newsSource')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
