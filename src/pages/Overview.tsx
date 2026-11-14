import { useEffect } from 'react';
import { INDICES, STOCKS } from '../../shared/catalog';
import type { Market, StockSummary } from '../../shared/types';
import { Barometer } from '../components/overview/Barometer';
import { Heatmap } from '../components/overview/Heatmap';
import { Highlights } from '../components/overview/Highlights';
import { IndexPanel } from '../components/overview/IndexPanel';
import { Movers } from '../components/overview/Movers';
import { News } from '../components/overview/News';
import { TickerTape } from '../components/overview/TickerTape';
import { ErrorNotice, Loading } from '../components/ui';
import { useT } from '../i18n';
import { fetchJson, historyPath, useFx, useIndices, useNews, useSummaries, withHistory } from '../lib/api';
import { useFormat } from '../lib/format';
import { barometer, currentStocks, sectorMoves, type SectorMove } from '../lib/market';
import { useMyList } from '../lib/myList';
import { usePageTitle } from '../lib/usePageTitle';
import { marketName, useMarket } from '../lib/universe';

const HIGHLIGHTS = ['AAPL', 'MSFT', 'NVDA', 'ASML.AS', 'NOVO-B.CO', 'MC.PA', 'IGN1L.VS', 'TEL1L.VS'];
// The tape runs through the hand-checked catalogue rather than the whole universe.
const TAPE = new Set(STOCKS.map((s) => s.symbol));

// While some markets are still loading, the brief counts the ones in and says which are not.
function Brief({ stocks, sectors, pending }: { stocks: StockSummary[]; sectors: SectorMove[]; pending: Market[] }) {
  const { t } = useT();
  const f = useFormat();
  const byMove = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const best = byMove[0];
  const worst = byMove[byMove.length - 1];
  const counts = { adv: f.num(stocks.filter((s) => s.changePct > 0).length, 0), n: f.num(stocks.length, 0) };
  const latest = stocks.reduce((max, s) => (s.time > max ? s.time : max), stocks[0].time);
  const headline =
    best.changePct > 0 && worst.changePct < 0
      ? t('overview.lead', { ...counts, best: t(`overview.sec.${best.sector}`), worst: t(`overview.sec.${worst.sector}`) })
      : t('overview.leadFlat', counts);
  return (
    <>
      <p className="lbl" style={{ margin: '0 0 10px' }}>
        {t('overview.leadK', { t: f.stamp(latest) })}
        {pending.length > 0 && ` · ${t('overview.pending', { list: pending.map(marketName).join('; ') })}`}
      </p>
      <h1 className="ser brief">
        {headline}
      </h1>
    </>
  );
}

export function Overview() {
  const { t, lang } = useT();
  usePageTitle(t('common.n1'));
  const { stocks, failed, pending, error } = useMarket();
  const listed = useMyList().entries.map((e) => e.symbol);
  // Sparklines need each stock's own summary; the visitor's list shares the requests with the highlights.
  const histories = useSummaries([...new Set([...listed, ...HIGHLIGHTS])]);
  const { indices, loading: indicesLoading } = useIndices();
  const fx = useFx();
  const news = useNews(lang);

  // The index chart waits for the index quotes; its data loads meanwhile.
  useEffect(() => {
    fetchJson(historyPath(INDICES[0].symbol, '1D')).catch(() => undefined);
  }, []);

  if (error) return <main className="wrap page"><ErrorNotice height={420} /></main>;

  // Today's picture uses only quotes from each exchange's latest session.
  const today = currentStocks(stocks, new Date());
  const sectors = sectorMoves(today);
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));
  // The bulk quote with the summary's sparkline, or the summary alone when the bulk list lacks the stock.
  const rows = (symbols: string[]) => symbols.flatMap((symbol) => {
    const quote = bySymbol.get(symbol);
    const full = histories.get(symbol);
    return quote ? [withHistory(quote, full)] : full ? [full] : [];
  });
  const mine = rows(listed);
  const tape = stocks.filter((s) => TAPE.has(s.symbol));

  return (
    <>
      <TickerTape items={[...indices, ...tape]} />
      <main className="wrap page">
        {mine.length > 0 && <Highlights title={t('common.n3')} more={{ to: '/portfolio', label: t('overview.editList') }} stocks={mine} />}
        <section className="ov-top">
          <div style={{ minWidth: 0 }}>
            {today.length > 0 ? <Brief stocks={today} sectors={sectors} pending={pending} /> : pending.length > 0 && <Loading height={90} />}
            {indices.length > 0 ? <IndexPanel indices={indices} /> : indicesLoading && <div className="pnl"><Loading height={360} /></div>}
          </div>
          <aside className="side">
            {today.length === 0 && pending.length > 0 ? (
              <div className="pnl"><Loading height={300} /></div>
            ) : (
              <>
                <Barometer value={barometer(today)} count={today.length} />
                <Movers stocks={today} fx={fx.data} />
              </>
            )}
          </aside>
        </section>
        {failed.length > 0 && (
          <p role="status" style={{ margin: 0, fontSize: 12.5, color: 'var(--ink3)' }}>
            {t('common.partial', { list: failed.map(marketName).join('; ') })}
          </p>
        )}
        <Highlights title={t('overview.watch')} more={{ to: '/screener', label: t('overview.manage') }} stocks={rows(HIGHLIGHTS)} loading={pending.length > 0} />
        <Heatmap stocks={stocks} pending={pending} failed={failed} fx={fx.data} />
        <News items={news.data ?? []} />
      </main>
    </>
  );
}
