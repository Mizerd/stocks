import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shortSymbol, STOCKS } from '../../shared/catalog';
import { Compare } from '../components/screener/Compare';
import { Filters } from '../components/screener/Filters';
import { ResultsTable } from '../components/screener/ResultsTable';
import { SideBySide } from '../components/screener/SideBySide';
import { ErrorNotice, Loading, PanelTitle } from '../components/ui';
import { useT } from '../i18n';
import { useFx, useStocks } from '../lib/api';
import {
  filterStocks, MAX_PICKS, NO_FILTERS, parseState, sortStocks, toSearchParams,
  type Filters as FilterValues, type ScreenerState, type SortKey,
} from '../lib/screener';
import { usePageTitle } from '../lib/usePageTitle';

// In the order of the "pre" names in screener.json. Limits follow what the data sources publish:
// dividend yields and P/E exist for US stocks only.
const PRESETS: Partial<FilterValues>[] = [
  { dyMin: 0.25 },
  { regions: ['EU'] },
  { sectors: ['T'], capMin: 500 },
  { regions: ['BAL'] },
];

const TEXT_SORTS: SortKey[] = ['symbol', 'name', 'sector'];

export function Screener() {
  const { t, list, lang } = useT();
  usePageTitle(t('screener.title'));
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(() => parseState(params));
  const { stocks, failed, loading, error } = useStocks();
  const fx = useFx().data;

  // The URL follows the state rather than being the state: router updates are deferred,
  // which would drop keystrokes in the search field.
  useEffect(() => {
    setParams(toSearchParams(state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = (patch: Partial<ScreenerState>) => setState((old) => ({ ...old, ...patch }));
  const clear = () => update(NO_FILTERS);

  // A new column starts A to Z for text and largest first for numbers; the same column flips.
  const sortBy = (key: SortKey) =>
    update({ sort: key, desc: key === state.sort ? !state.desc : !TEXT_SORTS.includes(key) });

  const togglePick = (symbol: string) =>
    update({ picks: state.picks.includes(symbol) ? state.picks.filter((s) => s !== symbol) : [...state.picks, symbol] });

  const found = sortStocks(filterStocks(stocks, state, fx), {
    sort: state.sort,
    desc: state.desc,
    fx,
    sectorName: (sector) => t(`screener.sec.${sector}`),
    locale: lang,
  });
  const picked = state.picks.flatMap((symbol) => stocks.find((s) => s.symbol === symbol) ?? []);

  return (
    <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 30, paddingBottom: 56 }}>
      <section style={{ marginBottom: 10 }}>
        <h1 className="ser" style={{ margin: 0, fontSize: 'clamp(34px, 3.6vw, 48px)', lineHeight: 1, fontWeight: 500, letterSpacing: '-0.02em' }}>
          {t('screener.title')}
        </h1>
        <p className="ser" style={{ margin: '10px 0 0', maxWidth: '34em', fontSize: 20, fontStyle: 'italic', lineHeight: 1.3, color: 'var(--ink2)', textWrap: 'pretty' }}>
          {t('screener.lead', { n: STOCKS.length })}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <span className="lbl" style={{ marginRight: 4 }}>{t('screener.presets')}</span>
          {list('screener.pre').map((name, i) => (
            <button key={name} className="chip" onClick={() => update({ ...NO_FILTERS, ...PRESETS[i] })}>{name}</button>
          ))}
        </div>
      </section>

      {stocks.length === 0 ? (
        <div className="pnl">{loading || !error ? <Loading height={320} /> : <ErrorNotice height={320} />}</div>
      ) : (
        <>
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Filters filters={state} onChange={update} onClear={clear} />

            <div className="pnl" style={{ flex: '999 1 640px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px' }}>
                <PanelTitle>{t('screener.results')}</PanelTitle>
                <input
                  className="fld"
                  type="search"
                  placeholder={t('screener.find')}
                  aria-label={t('screener.find')}
                  value={state.query}
                  onChange={(e) => update({ query: e.target.value })}
                  style={{ flex: '0 1 260px', minWidth: 0, height: 32, fontSize: 13, borderColor: 'var(--hair)' }}
                />
                <span role="status" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink2)' }}>
                  {t('screener.found', { n: found.length, total: stocks.length, picked: state.picks.length, max: MAX_PICKS })}
                </span>
              </div>
              {failed.length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
                  {t('common.partial', { list: failed.map(shortSymbol).join(', ') })}
                </p>
              )}

              <ResultsTable
                stocks={found}
                sort={state.sort}
                desc={state.desc}
                picks={state.picks}
                onSort={sortBy}
                onTogglePick={togglePick}
              />
              {found.length === 0 && (
                <div className="note" style={{ minHeight: 220 }}>
                  <p className="ser" style={{ fontSize: 20, fontStyle: 'italic' }}>{t('screener.emptyH')}</p>
                  <p style={{ fontSize: 12.5 }}>{t('screener.emptyP')}</p>
                  <button className="btn" onClick={clear}>{t('screener.clear')}</button>
                </div>
              )}
            </div>
          </section>

          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
