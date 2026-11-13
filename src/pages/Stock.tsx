import { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { shortSymbol } from '../../shared/catalog';
import { EXCHANGES } from '../../shared/exchanges';
import type { Listing, StockSummary } from '../../shared/types';
import { AddToList } from '../components/AddToList';
import { AboutCompany } from '../components/stock/AboutCompany';
import { AnalystView } from '../components/stock/AnalystView';
import { KeyFigures } from '../components/stock/KeyFigures';
import { Peers } from '../components/stock/Peers';
import { chartRange, PriceChart } from '../components/stock/PriceChart';
import { Quarters } from '../components/stock/Quarters';
import { ExtendedLine, QuoteLive } from '../components/stock/QuoteLive';
import { Returns } from '../components/stock/Returns';
import { Upcoming } from '../components/stock/Upcoming';
import { ErrorNotice, Loading, Notice } from '../components/ui';
import { useT } from '../i18n';
import { aboutPath, fetchJson, historyPath, prefetchStock, useDetail, useFx } from '../lib/api';
import { direction, useFormat } from '../lib/format';
import { similarStocks } from '../lib/market';
import { BENCHMARK } from '../lib/returns';
import { useInstrument, useMarket } from '../lib/universe';
import { usePageTitle } from '../lib/usePageTitle';

function UnknownStock({ symbol }: { symbol: string }) {
  const { t } = useT();
  usePageTitle(symbol);
  return (
    <main className="wrap page">
      <Notice height={260}>{t('stock.unknown', { symbol })}</Notice>
      <p style={{ textAlign: 'center' }}><Link to="/screener" className="btn">{t('stock.toScreener')}</Link></p>
    </main>
  );
}

function HeroPrice({ summary }: { summary: StockSummary }) {
  const f = useFormat();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 12px', marginTop: 14 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num hero-price">{f.price(summary.price)}</span>
        <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{summary.currency}</span>
      </span>
      <span className={`num bdg ${direction(summary.changePct)}`} style={{ fontSize: 15, minWidth: 0 }}>
        {f.signed(summary.change)} ({f.pct(summary.changePct)})
      </span>
      <QuoteLive summary={summary} />
      <ExtendedLine summary={summary} />
    </div>
  );
}

function StockPage({ inst }: { inst: Listing }) {
  const { t, lang } = useT();
  const { data: detail, error, loading } = useDetail(inst.symbol);
  const isStock = inst.kind === 'stock';
  const market = useMarket();
  const fx = useFx().data;
  const peers = isStock ? similarStocks(inst, market.stocks, fx) : [];
  const compareTo = `/screener?pick=${encodeURIComponent(inst.symbol)}`;
  usePageTitle(`${inst.name} (${shortSymbol(inst.symbol)})`);

  // The company text and the return table wait for the quote before they show; their data need not.
  useEffect(() => {
    if (!isStock) return;
    const benchmark = BENCHMARK[inst.region];
    const histories = (['1Y', '5Y'] as const).flatMap((range) => [historyPath(inst.symbol, range), historyPath(benchmark, range)]);
    for (const path of [aboutPath(inst.symbol, lang), ...histories]) fetchJson(path).catch(() => undefined);
  }, [inst, isStock, lang]);

  useEffect(() => {
    try {
      sessionStorage.setItem('lastStock', inst.symbol);
    } catch {
      // Storage can be blocked; the page works without it.
    }
  }, [inst.symbol]);

  return (
    <main className="wrap page">
      <section className="st-head">
        <div style={{ minWidth: 0 }}>
          <p className="lbl" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <span className="num st-sym">{shortSymbol(inst.symbol)}</span>
            <span>{EXCHANGES[inst.exchange].short} · {inst.sector ? t(`stock.sec.${inst.sector}`) : t('common.index')}</span>
          </p>
          <h1 className="ser h1">{inst.name}</h1>
          {/* Reserve the price line's height so the page does not jump when it arrives. */}
          {detail ? <HeroPrice summary={detail.summary} /> : <div style={{ height: 62 }} />}
        </div>
        {isStock && (
          <div className="st-acts">
            <AddToList symbol={inst.symbol} />
            <Link className="btn" to={compareTo}>{t('stock.cmp')}</Link>
          </div>
        )}
      </section>

      <section className="st-top">
        <PriceChart inst={inst} quote={detail?.summary} />
        <aside className="side">
          <section className="pnl">
            {detail ? <KeyFigures summary={detail.summary} /> : loading ? <Loading height={300} /> : error && <ErrorNotice height={300} />}
          </section>
          {detail?.analysts && <AnalystView analysts={detail.analysts} summary={detail.summary} />}
          {detail && <Upcoming upcoming={detail.upcoming} summary={detail.summary} />}
        </aside>
      </section>

      {isStock && detail && (
        <section className="cols">
          <section className="pnl st-perf" style={{ flex: '5 1 520px' }}>
            <Returns inst={inst} price={detail.summary.price} />
            {detail.quarterlyRevenue.length + detail.quarterlyEps.length > 0 && <Quarters detail={detail} />}
          </section>
          <section className="pnl" style={{ flex: '2 1 340px' }}>
            <AboutCompany detail={detail} />
          </section>
        </section>
      )}

      {peers.length > 0 && <Peers inst={inst} peers={peers} compareTo={compareTo} />}
    </main>
  );
}

export function Stock() {
  const { symbol = '' } = useParams();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const { listing: inst, loading } = useInstrument(symbol);

  // A stock outside the catalogue waits for the universe list; its data loads meanwhile.
  useEffect(() => {
    prefetchStock(symbol, chartRange(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  if (loading) return <main className="wrap page"><Loading height={420} /></main>;
  if (!inst) return <UnknownStock symbol={symbol} />;
  if (inst.symbol !== symbol) return <Navigate replace to={`/stock/${inst.symbol}${search}`} />;
  return <StockPage key={inst.symbol} inst={inst} />;
}
