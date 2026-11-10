import { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { STOCKS, findInstrument, shortSymbol } from '../../shared/catalog';
import { EXCHANGES } from '../../shared/exchanges';
import type { Instrument, StockSummary } from '../../shared/types';
import { AboutCompany } from '../components/stock/AboutCompany';
import { AnalystView } from '../components/stock/AnalystView';
import { Financials } from '../components/stock/Financials';
import { KeyFigures } from '../components/stock/KeyFigures';
import { Peers } from '../components/stock/Peers';
import { PriceChart } from '../components/stock/PriceChart';
import { ErrorNotice, FreshnessNote, Loading, Notice } from '../components/ui';
import { useT } from '../i18n';
import { useDetail } from '../lib/api';
import { direction, useFormat } from '../lib/format';
import { usePageTitle } from '../lib/usePageTitle';

// Other catalogue stocks of the same sector, the same region first.
function peerSymbols(inst: Instrument): string[] {
  const sameSector = STOCKS.filter((s) => s.sector === inst.sector && s.symbol !== inst.symbol);
  const near = sameSector.filter((s) => s.region === inst.region);
  const far = sameSector.filter((s) => s.region !== inst.region);
  return [...near, ...far].slice(0, 5).map((s) => s.symbol);
}

function UnknownStock({ symbol }: { symbol: string }) {
  const { t } = useT();
  usePageTitle(symbol);
  return (
    <main className="wrap" style={{ paddingTop: 30, paddingBottom: 56 }}>
      <Notice height={260}>{t('stock.unknown', { symbol })}</Notice>
      <p style={{ textAlign: 'center' }}><Link to="/screener" className="btn">{t('stock.toScreener')}</Link></p>
    </main>
  );
}

function HeroPrice({ summary }: { summary: StockSummary }) {
  const f = useFormat();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px', marginTop: 14 }}>
      <span className="num" style={{ fontSize: 46, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1 }}>{f.price(summary.price)}</span>
      <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{summary.currency}</span>
      <span className={`num bdg ${direction(summary.changePct)}`} style={{ fontSize: 15, minWidth: 0 }}>
        {f.signed(summary.change)} ({f.pct(summary.changePct)})
      </span>
      <FreshnessNote freshness={summary.freshness} time={summary.time} />
    </div>
  );
}

function StockPage({ inst }: { inst: Instrument }) {
  const { t } = useT();
  const { data: detail, error, loading } = useDetail(inst.symbol);
  const isStock = inst.kind === 'stock';
  const peers = isStock ? peerSymbols(inst) : [];
  const compareTo = `/screener?pick=${encodeURIComponent(inst.symbol)}`;
  usePageTitle(`${inst.name} (${shortSymbol(inst.symbol)})`);

  useEffect(() => {
    try {
      localStorage.setItem('lastStock', inst.symbol);
    } catch {
      // Storage can be blocked; the page works without it.
    }
  }, [inst.symbol]);

  return (
    <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 30, paddingBottom: 56 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px 40px', marginBottom: 10 }}>
        <div>
          <p className="lbl" style={{ margin: '0 0 8px' }}>
            <span className="num" style={{ padding: '2px 6px', border: '1px solid var(--ink)', borderRadius: 2, color: 'var(--ink)', letterSpacing: '0.04em' }}>
              {shortSymbol(inst.symbol)}
            </span>
            {'  '}{EXCHANGES[inst.exchange].short} · {inst.sector ? t(`stock.sec.${inst.sector}`) : t('common.index')}
          </p>
          <h1 className="ser" style={{ margin: 0, fontSize: 'clamp(36px, 4vw, 54px)', lineHeight: 1, fontWeight: 500, letterSpacing: '-0.02em' }}>{inst.name}</h1>
          {detail && <HeroPrice summary={detail.summary} />}
        </div>
        {isStock && <Link className="btn" to={compareTo}>{t('stock.cmp')}</Link>}
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <PriceChart inst={inst} />
        <aside style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section className="pnl" style={{ flex: detail?.analysts ? undefined : 1 }}>
            {detail ? <KeyFigures summary={detail.summary} /> : loading ? <Loading height={300} /> : error && <ErrorNotice height={300} />}
          </section>
          {detail?.analysts && <AnalystView analysts={detail.analysts} summary={detail.summary} />}
        </aside>
      </section>

      {isStock && detail && (
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Financials detail={detail} />
          <section className="pnl" style={{ flex: '1 1 360px', minWidth: 0 }}>
            <AboutCompany detail={detail} />
          </section>
        </section>
      )}

      {peers.length > 0 && <Peers symbols={peers} compareTo={compareTo} />}
    </main>
  );
}

export function Stock() {
  const { symbol = '' } = useParams();
  const { search } = useLocation();
  const inst = findInstrument(symbol);

  if (!inst) return <UnknownStock symbol={symbol} />;
  if (inst.symbol !== symbol) return <Navigate replace to={`/stock/${inst.symbol}${search}`} />;
  return <StockPage key={inst.symbol} inst={inst} />;
}
