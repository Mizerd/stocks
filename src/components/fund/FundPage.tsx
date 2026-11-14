import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import { FUND_PERIODS } from '../../../shared/funds';
import type { FundFacts, History, Listing, Range, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { isUnavailable, useDetail, useHistory } from '../../lib/api';
import { DASH, direction, useFormat } from '../../lib/format';
import { rangePosition } from '../../lib/returns';
import { usePageTitle } from '../../lib/usePageTitle';
import { AddToList } from '../AddToList';
import { ErrorNotice, Loading, Notice, PanelTitle, Seg } from '../ui';
import { ChartPlot, type Indicator } from '../stock/ChartPlot';
import { LeaderRow } from '../stock/LeaderRow';

// A fund has one NAV a business day: no intraday ranges, no candles, no volume or indicators.
const RANGES: Range[] = ['1M', '6M', '1Y', '5Y'];
const DEFAULT_FUND_RANGE: Range = '1Y';
// The stock chart's range labels, whose order these ranges are looked up in.
const LABEL_ORDER: Range[] = ['1D', '5D', '1M', '6M', '1Y', '5Y'];
const NO_INDICATORS: Record<Indicator, boolean> = { sma20: false, sma50: false, bb: false, vol: false, rsi: false };
const PLOT_AREA_HEIGHT = 420;

// "Swedbank Robur · Equity fund"
function useKindLine(inst: Listing) {
  const { t } = useT();
  return [t('common.fund'), inst.company, inst.category && t(`stock.fund.cat.${inst.category}`)].filter(Boolean).join(' · ');
}

function NavHero({ summary, facts }: { summary: StockSummary; facts?: FundFacts }) {
  const { t } = useT();
  const f = useFormat();
  const hasChange = summary.prevClose !== summary.price || summary.change !== 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 12px', marginTop: 14 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num hero-price">{f.price(summary.price)}</span>
        <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{summary.currency}</span>
      </span>
      {hasChange && (
        <span className={`num bdg ${direction(summary.changePct)}`} style={{ fontSize: 15, minWidth: 0 }}>
          {f.signed(summary.change, 2, 4)} ({f.pct(summary.changePct)})
        </span>
      )}
      {facts && <span className="pill">{t('common.navOn', { date: f.date(`${facts.navDate}T12:00:00Z`, 'UTC') })}</span>}
    </div>
  );
}

const rangeReturn = (history: History) => {
  const visible = history.candles.slice(history.warmup);
  if (visible.length === 0) return null;
  return (visible[visible.length - 1].c / (history.prevClose ?? visible[0].c) - 1) * 100;
};

function FundChart({ inst }: { inst: Listing }) {
  const { t, list } = useT();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const range = RANGES.find((r) => r === params.get('range')) ?? DEFAULT_FUND_RANGE;
  const { data, error, loading } = useHistory(inst.symbol, range);
  const history = data && !isUnavailable(data) && data.candles.length > data.warmup ? data : undefined;
  const change = history ? rangeReturn(history) : null;
  const labels = list('stock.ranges');
  const labelOf = (r: Range) => labels[LABEL_ORDER.indexOf(r)];

  function setRange(value: Range) {
    const next = new URLSearchParams(params);
    if (value === DEFAULT_FUND_RANGE) next.delete('range');
    else next.set('range', value);
    setParams(next, { replace: true });
  }

  function plotArea() {
    if (history) {
      const label = t('stock.chart', { name: inst.name, range: labelOf(range), pct: f.pct(change) });
      return <ChartPlot key={`${inst.symbol} ${range}`} history={history} exchange={inst.exchange} type="line" shown={NO_INDICATORS} label={label} valueLabel={t('stock.fund.nav')} />;
    }
    if (loading) return <Loading height={PLOT_AREA_HEIGHT} />;
    if (error) return <ErrorNotice height={PLOT_AREA_HEIGHT} />;
    return <Notice height={PLOT_AREA_HEIGHT}>{t('stock.noHistory')}</Notice>;
  }

  return (
    <div className="pnl">
      <div className="tb">
        <Seg label={t('common.rgLabel')} options={RANGES.map((r) => ({ value: r, label: labelOf(r) }))} value={range} onChange={setRange} />
        {change !== null && (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className={`num ${direction(change)}`} style={{ fontSize: 13.5, fontWeight: 600 }}>{f.pct(change)}</span>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{list('stock.per')[LABEL_ORDER.indexOf(range)]}</span>
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>{t('stock.fund.chartNote')}</span>
      </div>
      <div style={{ marginTop: 14 }}>{plotArea()}</div>
    </div>
  );
}

// SRI 1 to 7 as seven cells with the fund's one filled.
function RiskScale({ risk }: { risk: number }) {
  const { t } = useT();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <span
            key={n}
            style={{
              width: 12, height: 12, borderRadius: 2, fontSize: 0,
              background: n === risk ? 'var(--ink)' : 'transparent', boxShadow: 'inset 0 0 0 1px var(--hair)',
            }}
          />
        ))}
      </span>
      <span>{t('stock.fund.riskOf', { n: risk })}</span>
    </span>
  );
}

function Facts({ summary, facts }: { summary: StockSummary; facts: FundFacts }) {
  const { t } = useT();
  const f = useFormat();
  const year = summary.low52 !== null && summary.high52 !== null ? rangePosition(summary.low52, summary.high52, summary.price) : null;
  const day = (value: string) => f.date(`${value}T12:00:00Z`, 'UTC');
  return (
    <>
      <h2 className="ser pnl-title" style={{ marginBottom: 8 }}>{t('stock.fund.facts')}</h2>
      <LeaderRow label={t('stock.fund.nav')} numeric>{`${f.price(summary.price)} ${summary.currency}`}</LeaderRow>
      <LeaderRow label={t('stock.fund.navDate')} numeric>{day(facts.navDate)}</LeaderRow>
      <LeaderRow label={t('stock.fund.fee')} numeric>{facts.ongoingCharge === null ? DASH : t('stock.fund.feeYear', { v: f.plainPct(facts.ongoingCharge) })}</LeaderRow>
      <LeaderRow label={t('stock.fund.risk')}>{facts.risk === null ? DASH : <RiskScale risk={facts.risk} />}</LeaderRow>
      <LeaderRow label={t('stock.fund.type')}>{t(`stock.fund.cat.${facts.category}`)}</LeaderRow>
      <LeaderRow label={t('stock.fund.style')}>{facts.indexFund === null ? DASH : t(facts.indexFund ? 'stock.fund.indexFund' : 'stock.fund.active')}</LeaderRow>
      <LeaderRow label={t('stock.fund.company')}>{facts.company}</LeaderRow>
      <LeaderRow label="ISIN" numeric>{facts.isin}</LeaderRow>
      <LeaderRow label={t('stock.fund.inception')} numeric>{facts.inception ? day(facts.inception) : DASH}</LeaderRow>
      {facts.benchmark && (
        <div style={{ padding: '6px 0' }}>
          <span style={{ color: 'var(--ink2)' }}>{t('stock.fund.benchmark')}</span>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 500 }}>{facts.benchmark}</p>
        </div>
      )}
      {year !== null && (
        <div style={{ marginTop: 12 }}>
          <span className="lbl">{t('stock.fund.range52')}</span>
          <div aria-hidden="true" style={{ position: 'relative', height: 18, marginTop: 4 }}>
            <span style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: 'var(--sel)', boxShadow: 'inset 0 0 0 1px var(--hair)' }} />
            <span className="rng-dot" style={{ left: `${year}%` }} />
          </div>
          <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 12 }}>
            <span>{f.price(summary.low52)}</span>
            <span>{f.price(summary.high52)}</span>
          </div>
        </div>
      )}
      <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--ink3)' }}>
        {t('stock.fund.source')}: {t(`stock.fund.src.${facts.source}`)}
      </p>
    </>
  );
}

function Returns({ facts }: { facts: FundFacts }) {
  const { t, list } = useT();
  const f = useFormat();
  const labels = list('stock.fund.periods');
  const rows = FUND_PERIODS.map((period, i) => ({ label: labels[i], value: facts.returns[period] }));
  // Scaled to the periods up to a year; longer moves simply fill their half of the track.
  const top = Math.max(1, ...rows.slice(0, 6).map((r) => Math.abs(r.value ?? 0)));
  const half = (value: number) => Math.min(50, (Math.abs(value) / top) * 50);
  return (
    <div>
      <PanelTitle>{t('stock.fund.ret')}</PanelTitle>
      <p className="pnl-note">{t(facts.history ? 'stock.fund.retNoteCalc' : 'stock.fund.retNoteSrc')}</p>
      <table className="ret num">
        <thead>
          <tr>
            <th scope="col"><span className="sr">{t('stock.perfPeriod')}</span></th>
            <td />
            <th scope="col">{t('stock.fund.ret')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className="ret-plot">
                <span className="ret-track" aria-hidden="true">
                  {row.value !== null && (
                    <span
                      className={`ret-bar ${row.value < 0 ? 'dn' : 'up'}`}
                      style={{ left: `${row.value < 0 ? 50 - half(row.value) : 50}%`, width: `${half(row.value)}%` }}
                    />
                  )}
                </span>
              </td>
              <td className={direction(row.value)} style={{ fontWeight: 600 }}>{f.pct(row.value, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FundPage({ inst }: { inst: Listing }) {
  const { t } = useT();
  const { data: detail, error, loading } = useDetail(inst.symbol);
  const facts = detail?.fund;
  const kindLine = useKindLine(inst);
  usePageTitle(inst.name);

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
            <span>{kindLine}</span>
          </p>
          <h1 className="ser h1">{inst.name}</h1>
          {detail ? <NavHero summary={detail.summary} facts={facts} /> : <div style={{ height: 62 }} />}
        </div>
        <div className="st-acts">
          <AddToList symbol={inst.symbol} />
        </div>
      </section>

      <section className="st-top">
        {facts?.history ? (
          <FundChart inst={inst} />
        ) : facts ? (
          // No NAV history to chart: the published returns take the chart's place.
          <section className="pnl">
            <Returns facts={facts} />
            <p style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('stock.fund.noChart', { company: facts.company })}</p>
          </section>
        ) : (
          <div className="pnl">{loading ? <Loading height={PLOT_AREA_HEIGHT} /> : <ErrorNotice height={PLOT_AREA_HEIGHT} />}</div>
        )}
        <aside className="side">
          <section className="pnl">
            {detail && facts ? <Facts summary={detail.summary} facts={facts} /> : loading ? <Loading height={300} /> : error && <ErrorNotice height={300} />}
          </section>
        </aside>
      </section>

      {facts?.history && (
        <section className="cols">
          <section className="pnl st-perf" style={{ flex: '5 1 520px' }}>
            <Returns facts={facts} />
          </section>
        </section>
      )}
    </main>
  );
}
