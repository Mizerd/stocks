import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { prefetchProps } from '../../lib/prefetch';
import { Badge, Loading, PanelTitle, Sparkline } from '../ui';

interface HighlightsProps {
  title: string;
  more: { to: string; label: string };
  stocks: StockSummary[];
  loading?: boolean;
}

export function Highlights({ title, more, stocks, loading = false }: HighlightsProps) {
  const { t, list } = useT();
  const f = useFormat();
  // The extra columns on wide screens reuse the screener's headings.
  const heads = list('screener.heads');
  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{title}</PanelTitle>
        <Link to={more.to} className="link">{more.label}</Link>
      </div>
      {loading && stocks.length === 0 ? (
        <Loading height={200} />
      ) : (
        <div className="scroll-x" style={{ marginTop: 10 }}>
          <div className="qt">
            <div className="lbl tbl-head qt-hl">
              <span>{t('overview.cSym')}</span>
              <span>{t('overview.cName')}</span>
              <span>{t('overview.cDay')}</span>
              <span className="r">{t('overview.cPrice')}</span>
              <span className="r">{t('overview.cChg')}</span>
              <span className="r">{t('overview.cVol')}</span>
              <span className="r c-cap">{heads[5]}</span>
              <span className="r c-1y">{heads[8]}</span>
            </div>
            {stocks.map((s) => (
              <Link key={s.symbol} to={`/stock/${s.symbol}`} className="row tbl-row qt-hl" {...prefetchProps(s.symbol)}>
                <span className="num c-sym" style={{ fontWeight: 600 }}>{shortSymbol(s.symbol)}</span>
                <span className="clip c-name">{s.name}</span>
                <span className="c-spark"><Sparkline values={s.spark} change={s.spark[s.spark.length - 1] - s.spark[0]} /></span>
                <span className="num r c-price">
                  {f.price(s.price)} <span className="cur">{s.currency}</span>
                </span>
                <span className="r c-chg"><Badge value={s.changePct} /></span>
                <span className="num r c-vol" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{f.big(s.volume)}</span>
                <span className="num r c-cap" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{f.big(s.marketCap)}</span>
                <span className={`num r c-1y ${direction(s.return1Y)}`} style={{ fontSize: 12.5 }}>{f.pct(s.return1Y, 1)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
