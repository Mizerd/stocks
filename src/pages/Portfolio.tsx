import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INDICES } from '../../shared/catalog';
import { Allocation } from '../components/portfolio/Allocation';
import { Dividends } from '../components/portfolio/Dividends';
import { EntryForm } from '../components/portfolio/EntryForm';
import { Holdings } from '../components/portfolio/Holdings';
import { ListTools } from '../components/portfolio/ListTools';
import { Performance } from '../components/portfolio/Performance';
import { Summary } from '../components/portfolio/Summary';
import { ErrorNotice, Loading } from '../components/ui';
import { useT } from '../i18n';
import { useFx, useStocks } from '../lib/api';
import { useMyList } from '../lib/myList';
import { allocation, valuePortfolio } from '../lib/portfolio';
import { usePageTitle } from '../lib/usePageTitle';

const BENCHMARK = INDICES.find((i) => i.symbol === 'NDX')!;

export function Portfolio() {
  const { t } = useT();
  usePageTitle(t('portfolio.title'));
  const myList = useMyList();
  const [adding, setAdding] = useState(false);
  const { stocks, loading, error } = useStocks();
  const fx = useFx();

  const entries = myList.entries;
  const empty = entries.length === 0;
  const rates = fx.data;
  const valuation = rates && !loading && !error && !empty ? valuePortfolio(entries, stocks, rates, 0) : undefined;
  const valued = valuation && valuation.positions.length > 0;
  const missing = entries.filter((e) => !stocks.some((s) => s.symbol === e.symbol)).map((e) => e.symbol);

  return (
    <main className="wrap page">
      <section>
        <p className="lbl" style={{ margin: '0 0 10px' }}>{t('portfolio.acctOwn')}</p>
        <h1 className="ser h1">{t('portfolio.title')}</h1>
        {empty && !adding && <p className="ser lead" style={{ maxWidth: '44em' }}>{t('portfolio.empty')}</p>}
        <div className="ml-bar">
          {!adding && (
            <button type="button" className="btn pri" onClick={() => setAdding(true)}>{t('portfolio.add')}</button>
          )}
          <ListTools entries={myList.entries} onImport={myList.importEntries} onClear={myList.clear} />
        </div>
        <p className="ml-saved">
          {t('portfolio.savedHere')} <Link to="/about#privacy" className="link">{t('portfolio.savedHow')}</Link>
        </p>
        {adding && (
          <div className="pnl" style={{ marginTop: 14 }}>
            <EntryForm
              taken={myList.entries.map((e) => e.symbol)}
              onSave={(entry) => {
                myList.add(entry);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
        {valued && (
          <Summary
            valuation={valuation}
            valueNote={t('portfolio.counts', { n: valuation.positions.length, m: entries.length - valuation.positions.length })}
          />
        )}
        {valuation && missing.length > 0 && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.missing', { list: missing.join(', ') })}</p>
        )}
      </section>
      {!empty && (loading || fx.loading) && <Loading height={420} />}
      {!empty && !loading && !fx.loading && !valuation && <ErrorNotice height={420} />}
      {valuation && rates && (
        <>
          {valued && (
            <section className="cols">
              <Performance positions={valuation.positions} fx={rates} benchmark={BENCHMARK} />
              <Allocation slices={allocation(valuation, 0)} />
            </section>
          )}
          <Holdings
            entries={entries}
            stocks={stocks}
            valuation={valuation}
            fx={rates}
            edit={{ save: myList.add, remove: myList.remove }}
          />
          {valued && <Dividends valuation={valuation} />}
        </>
      )}
    </main>
  );
}
