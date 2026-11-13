import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { STOCKS } from '../../shared/catalog';
import { Compare } from '../components/screener/Compare';
import { Filters } from '../components/screener/Filters';
import { ResultsTable } from '../components/screener/ResultsTable';
import { SideBySide } from '../components/screener/SideBySide';
import { ErrorNotice, Loading, PanelTitle } from '../components/ui';
import { useT } from '../i18n';
import { useFx, useSummaries, withHistory } from '../lib/api';
import { useFormat } from '../lib/format';
import type { Sector } from '../../shared/types';
import {
  filterStocks, MAX_PICKS, NO_FILTERS, parseState, PE_NO_LIMIT, sortStocks, toSearchParams,
  type Filters as FilterValues, type ScreenerState, type SortKey,
} from '../lib/screener';
import { usePageTitle } from '../lib/usePageTitle';
import { marketName, useMarket } from '../lib/universe';

// In the order of the "pre" names in screener.json. Limits follow what the data sources publish:
// P/E exists for US stocks only, dividend yields for Nasdaq-listed ones only.
const PRESETS: Partial<FilterValues>[] = [
  { dyMin: 0.25 },
  { regions: ['EU'] },
  { sectors: ['T'], capMin: 500 },
  { regions: ['BAL'] },
];

const TEXT_SORTS: SortKey[] = ['symbol', 'name', 'sector'];
const PAGE = 50;
// P/E and dividend yield exist for US stocks only and need each stock's own figures, so the
// catalogue's US stocks are always loaded; the rest load as their rows come into view.
const ALWAYS_LOADED = STOCKS.filter((s) => s.provider === 'nasdaq').map((s) => s.symbol);
const HISTORY_KEYS: SortKey[] = ['pe', 'dy', 'ret'];

export function Screener() {
  const { t, list, lang } = useT();
  usePageTitle(t('screener.title'));
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(() => parseState(params));
  const [shown, setShown] = useState(PAGE);
  const { stocks: quoted, failed, loading, error } = useMarket();
  const fx = useFx().data;
  const f = useFormat();

  // The URL follows the state rather than being the state: router updates are deferred,
  // which would drop keystrokes in the search field.
  useEffect(() => {
    setParams(toSearchParams(state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = (patch: Partial<ScreenerState>) => {
    setState((old) => ({ ...old, ...patch }));
    if (!('picks' in patch) && !('range' in patch)) setShown(PAGE);
  };
  const clear = () => update(NO_FILTERS);

  // A new column starts A to Z for text and largest first for numbers; the same column flips.
  const sortBy = (key: SortKey) =>
    update({ sort: key, desc: key === state.sort ? !state.desc : !TEXT_SORTS.includes(key) });

  const togglePick = (symbol: string) =>
    update({ picks: state.picks.includes(symbol) ? state.picks.filter((s) => s !== symbol) : [...state.picks, symbol] });

  const sortOptions = { sort: state.sort, desc: state.desc, fx, sectorName: (sector: Sector) => t(`screener.sec.${sector}`), locale: lang };
  // The rows on screen are found from the bulk quotes first, then enriched with the figures that need history.
  // A yield filter can only keep Nasdaq-listed shares, so their figures are the ones loaded first.
  const candidates = state.dyMin > 0 ? quoted.filter((s) => s.exchange === 'XNAS') : quoted;
  const visible = sortStocks(filterStocks(candidates, { ...state, peMax: PE_NO_LIMIT, dyMin: 0 }, fx), sortOptions).slice(0, shown);
  const histories = useSummaries([...new Set([...ALWAYS_LOADED, ...state.picks, ...visible.map((s) => s.symbol)])]);
  const stocks = quoted.map((s) => withHistory(s, histories.get(s.symbol)));
  const found = sortStocks(filterStocks(stocks, state, fx), sortOptions);
  const picked = state.picks.flatMap((symbol) => stocks.find((s) => s.symbol === symbol) ?? []);
  const needsHistory = state.peMax < PE_NO_LIMIT || state.dyMin > 0 || HISTORY_KEYS.includes(state.sort);

  return (
    <main className="wrap page">
      <section style={{ marginBottom: 6 }}>
        <h1 className="ser h1">{t('screener.title')}</h1>
        <p className="ser lead">{t('screener.lead', { n: f.num(quoted.length || STOCKS.length, 0) })}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <span className="lbl" style={{ flexBasis: '100%' }}>{t('screener.presets')}</span>
          {list('screener.pre').map((name, i) => (
            <button key={name} className="chip" onClick={() => update({ ...NO_FILTERS, ...PRESETS[i] })}>{name}</button>
          ))}
        </div>
      </section>

      {loading || quoted.length === 0 ? (
        <div className="pnl">{loading || !error ? <Loading height={320} /> : <ErrorNotice height={320} />}</div>
      ) : (
        <>
          <section className="scr">
            <Filters filters={state} onChange={update} onClear={clear} />

            <div className="pnl">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px' }}>
                <PanelTitle>{t('screener.results')}</PanelTitle>
                <input
                  className="fld"
                  type="search"
                  placeholder={t('screener.find')}
                  aria-label={t('screener.find')}
                  value={state.query}
                  onChange={(e) => update({ query: e.target.value })}
                  style={{ flex: '1 1 220px', maxWidth: 320, minWidth: 0 }}
                />
                <span role="status" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink2)' }}>
                  {t('screener.found', { n: f.num(found.length, 0), total: f.num(stocks.length, 0), picked: state.picks.length, max: MAX_PICKS })}
                </span>
              </div>
              {failed.length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
                  {t('common.partial', { list: failed.map(marketName).join('; ') })}
                </p>
              )}
              {needsHistory && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('screener.histNote', { n: f.num(histories.size, 0) })}</p>
              )}

              <ResultsTable
                stocks={found.slice(0, shown)}
                sort={state.sort}
                desc={state.desc}
                picks={state.picks}
                onSort={sortBy}
                onTogglePick={togglePick}
              />
              {found.length > shown && (
                <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', margin: '14px 0 0' }}>
                  <button className="btn" onClick={() => setShown(shown + PAGE)}>{t('screener.more', { n: Math.min(PAGE, found.length - shown) })}</button>
                  <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{t('screener.shown', { n: f.num(shown, 0), total: f.num(found.length, 0) })}</span>
                </p>
              )}
              {found.length === 0 && !loading && (
                <div className="note" style={{ minHeight: 220 }}>
                  <p className="ser note-text">{t('screener.emptyH')}</p>
                  <p style={{ fontSize: 12.5 }}>{t('screener.emptyP')}</p>
                  <button className="btn" onClick={clear}>{t('screener.clear')}</button>
                </div>
              )}
            </div>
          </section>

          <section className="cols">
            <Compare
              picked={picked}
              range={state.range}
              onRange={(range) => update({ range })}
              onRemove={togglePick}
            />
            {picked.length > 0 && <SideBySide picked={picked} fx={fx} />}
          </section>
        </>
      )}
    </main>
  );
}
