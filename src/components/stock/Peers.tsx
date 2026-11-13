import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { useSummaries, withHistory } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { Badge, PanelTitle, Sparkline } from '../ui';

export function Peers({ stocks: quoted, compareTo }: { stocks: StockSummary[]; compareTo: string }) {
  const { t } = useT();
  const f = useFormat();
  const histories = useSummaries(quoted.map((s) => s.symbol));
  const stocks = quoted.map((s) => withHistory(s, histories.get(s.symbol)));

  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{t('stock.peers')}</PanelTitle>
        <Link to={compareTo} className="link">{t('stock.peersCmp')}</Link>
      </div>
      {stocks.length > 0 && (
        <div className="scroll-x" style={{ marginTop: 10 }}>
          <div className="qt wide">
            <div className="lbl tbl-head qt-peers">
              <span>{t('stock.cSym')}</span>
              <span>{t('stock.cName')}</span>
              <span>{t('stock.cDay')}</span>
              <span className="r">{t('stock.cPrice')}</span>
              <span className="r">{t('stock.cChg')}</span>
              <span className="r">{t('stock.cPe')}</span>
              <span className="r">{t('stock.cCap')}</span>
            </div>
            {stocks.map((s) => (
              <Link key={s.symbol} to={`/stock/${s.symbol}`} className="row tbl-row qt-peers">
                <span className="num c-sym" style={{ fontWeight: 600 }}>{shortSymbol(s.symbol)}</span>
                <span className="clip c-name">{s.name}</span>
                <span className="c-spark"><Sparkline values={s.spark} change={s.changePct} /></span>
                <span className="num r c-price">
                  {f.price(s.price)} <span className="cur">{s.currency}</span>
                </span>
                <span className="r c-chg"><Badge value={s.changePct} /></span>
                <span className="num r c-pe" style={{ fontSize: 12.5 }}>{f.num(s.pe, 1)}</span>
                <span className="num r c-cap" style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{f.big(s.marketCap)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
