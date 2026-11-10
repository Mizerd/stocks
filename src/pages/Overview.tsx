import type { StockSummary } from '../../shared/types';
import { Barometer } from '../components/overview/Barometer';
import { Highlights } from '../components/overview/Highlights';
import { IndexPanel } from '../components/overview/IndexPanel';
import { Movers } from '../components/overview/Movers';
import { News } from '../components/overview/News';
import { Sectors } from '../components/overview/Sectors';
import { TickerTape } from '../components/overview/TickerTape';
import { ErrorNotice, Loading } from '../components/ui';
import { useT } from '../i18n';
import { useFx, useIndices, useNews, useStocks } from '../lib/api';
import { useFormat } from '../lib/format';
import { barometer, sectorMoves, type SectorMove } from '../lib/market';
import { usePageTitle } from '../lib/usePageTitle';

const HIGHLIGHTS = ['AAPL', 'MSFT', 'NVDA', 'ASML.AS', 'NOVO-B.CO', 'MC.PA', 'IGN1L.VS', 'TEL1L.VS'];

function Brief({ stocks, sectors }: { stocks: StockSummary[]; sectors: SectorMove[] }) {
  const { t } = useT();
  const f = useFormat();
  const byMove = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const best = byMove[0];
  const worst = byMove[byMove.length - 1];
  const counts = { adv: stocks.filter((s) => s.changePct > 0).length, n: stocks.length };
  const latest = stocks.reduce((max, s) => (s.time > max ? s.time : max), stocks[0].time);
  const headline =
    best.changePct > 0 && worst.changePct < 0
      ? t('overview.lead', { ...counts, best: t(`overview.sec.${best.sector}`), worst: t(`overview.sec.${worst.sector}`) })
      : t('overview.leadFlat', counts);
  return (
    <>
      <p className="lbl" style={{ margin: '0 0 10px' }}>{t('overview.leadK', { t: f.stamp(latest) })}</p>
      <h1 className="ser brief">
        {headline}
      </h1>
    </>
  );
}

export function Overview() {
  const { t, lang } = useT();
  usePageTitle(t('common.n1'));
  const { stocks, failed, loading, error } = useStocks();
  const { indices } = useIndices();
  const fx = useFx();
  const news = useNews(lang);

  if (loading) return <main className="wrap page"><Loading height={420} /></main>;
  if (error || stocks.length === 0) return <main className="wrap page"><ErrorNotice height={420} /></main>;

  const sectors = sectorMoves(stocks);
  const highlights = HIGHLIGHTS.flatMap((symbol) => stocks.filter((s) => s.symbol === symbol));

  return (
    <>
      <TickerTape items={[...indices, ...stocks]} />
      <main className="wrap page">
        <section className="ov-top">
          <div style={{ minWidth: 0 }}>
            <Brief stocks={stocks} sectors={sectors} />
            {indices.length > 0 && <IndexPanel indices={indices} />}
          </div>
          <aside className="side">
            <Barometer value={barometer(stocks)} count={stocks.length} />
            <Movers stocks={stocks} fx={fx.data} />
          </aside>
        </section>
        {failed.length > 0 && (
          <p role="status" style={{ margin: 0, fontSize: 12.5, color: 'var(--ink3)' }}>{t('common.partial', { list: failed.join(', ') })}</p>
        )}
        <section className="cols">
          <Highlights stocks={highlights} />
          <Sectors sectors={sectors} />
        </section>
        <News items={news.data ?? []} />
      </main>
    </>
  );
}
