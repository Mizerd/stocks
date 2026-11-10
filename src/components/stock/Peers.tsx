import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import { useT } from '../../i18n';
import { useStocks } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { Badge, ErrorNotice, Loading, PanelTitle, Sparkline } from '../ui';

const COLUMNS = '76px minmax(130px, 2fr) 120px minmax(90px, 1fr) 92px minmax(64px, 0.6fr) minmax(100px, 1fr)';
const right = { textAlign: 'right' } as const;

export function Peers({ symbols, compareTo }: { symbols: string[]; compareTo: string }) {
  const { t } = useT();
  const f = useFormat();
  const { stocks, loading, error } = useStocks(symbols);

  return (
    <section className="pnl">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <PanelTitle>{t('stock.peers')}</PanelTitle>
        <Link to={compareTo} className="hl" style={{ fontSize: 13, fontWeight: 500 }}>{t('stock.peersCmp')}</Link>
      </div>
      {stocks.length === 0 && (loading ? <Loading /> : error && <ErrorNotice />)}
      {stocks.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <div style={{ minWidth: 680 }}>
            <div className="lbl" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, padding: 8, borderBottom: '1px solid var(--ink)' }}>
              <span>{t('stock.cSym')}</span>
              <span>{t('stock.cName')}</span>
              <span>{t('stock.cDay')}</span>
              <span style={right}>{t('stock.cPrice')}</span>
              <span style={right}>{t('stock.cChg')}</span>
              <span style={right}>{t('stock.cPe')}</span>
              <span style={right}>{t('stock.cCap')}</span>
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
                <Sparkline values={s.spark} change={s.changePct} />
                <span className="num" style={right}>
                  {f.price(s.price)} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.currency}</span>
                </span>
                <span style={right}><Badge value={s.changePct} /></span>
                <span className="num" style={{ ...right, fontSize: 12.5 }}>{f.num(s.pe, 1)}</span>
                <span className="num" style={{ ...right, fontSize: 12.5, color: 'var(--ink2)' }}>{f.big(s.marketCap)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
