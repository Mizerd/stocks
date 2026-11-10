import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import { Badge, PanelTitle, Sparkline } from '../ui';

const COLUMNS = '76px minmax(130px, 2fr) 110px minmax(110px, 1fr) 92px minmax(84px, 0.8fr)';

export function Highlights({ stocks }: { stocks: StockSummary[] }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <div className="pnl" style={{ flex: '999 1 560px', minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <PanelTitle>{t('overview.watch')}</PanelTitle>
        <Link to="/screener" className="hl" style={{ fontSize: 13, fontWeight: 500 }}>{t('overview.manage')}</Link>
      </div>
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <div style={{ minWidth: 600 }}>
          <div className="lbl" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, padding: 8, borderBottom: '1px solid var(--ink)' }}>
            <span>{t('overview.cSym')}</span>
            <span>{t('overview.cName')}</span>
            <span>{t('overview.cDay')}</span>
            <span style={{ textAlign: 'right' }}>{t('overview.cPrice')}</span>
            <span style={{ textAlign: 'right' }}>{t('overview.cChg')}</span>
            <span style={{ textAlign: 'right' }}>{t('overview.cVol')}</span>
          </div>
          {stocks.map((s) => (
            <Link
              key={s.symbol}
              to={`/stock/${s.symbol}`}
              className="row"
              style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 14, height: 46, padding: '0 8px', borderBottom: '1px solid var(--hair)' }}
            >
              <span className="num" style={{ fontWeight: 500 }}>{shortSymbol(s.symbol)}</span>
              <span className="clip">{s.name}</span>
              <Sparkline values={s.spark} change={s.spark[s.spark.length - 1] - s.spark[0]} />
              <span className="num" style={{ textAlign: 'right' }}>
                {f.price(s.price)} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.currency}</span>
              </span>
              <span style={{ textAlign: 'right' }}><Badge value={s.changePct} /></span>
              <span className="num" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--ink2)' }}>{f.big(s.volume)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
