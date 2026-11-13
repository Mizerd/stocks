import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import { EXCHANGES } from '../../../shared/exchanges';
import type { Listing } from '../../../shared/types';
import { useT } from '../../i18n';
import { useSummaries, withHistory } from '../../lib/api';
import { useFormat } from '../../lib/format';
import type { Peer, PeerReason } from '../../lib/market';
import { prefetchProps } from '../../lib/prefetch';
import { Badge, PanelTitle, Sparkline } from '../ui';

const REASON_KEY: Record<PeerReason, string> = { sectorExchange: 'stock.whySecEx', sectorRegion: 'stock.whySecReg', exchange: 'stock.whyEx' };

interface Props {
  inst: Listing;
  peers: Peer[];
  compareTo: string;
}

export function Peers({ inst, peers, compareTo }: Props) {
  const { t } = useT();
  const f = useFormat();
  const histories = useSummaries(peers.map((p) => p.stock.symbol));
  const stocks = peers.map((p) => withHistory(p.stock, histories.get(p.stock.symbol)));
  const why = (reason: PeerReason) => t(REASON_KEY[reason], {
    place: reason === 'sectorRegion' ? t(`common.bloc.${inst.region.toLowerCase()}`) : EXCHANGES[inst.exchange].short,
  });

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
            {stocks.map((s, i) => (
              <Link key={s.symbol} to={`/stock/${s.symbol}`} className="row tbl-row qt-peers" {...prefetchProps(s.symbol)}>
                <span className="num c-sym" style={{ fontWeight: 600 }}>{shortSymbol(s.symbol)}</span>
                <span className="c-name" style={{ minWidth: 0 }}>
                  <span className="clip" style={{ display: 'block' }}>{s.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.3, color: 'var(--ink3)' }}>{why(peers[i].reason)}</span>
                </span>
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
