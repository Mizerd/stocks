import { useState } from 'react';
import { shortSymbol } from '../../../shared/catalog';
import type { FxRates, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { SORT_KEYS, storedSort, storeSort, type ListEntry, type SortKey } from '../../lib/myList';
import { listRows, sortRows, type Row, type Valuation } from '../../lib/portfolio';
import { ConfirmBar } from '../ConfirmBar';
import { PanelTitle } from '../ui';
import { EntryForm } from './EntryForm';
import { HoldingRow } from './HoldingRow';

interface Props {
  entries: ListEntry[];
  stocks: StockSummary[];
  valuation: Valuation;
  fx: FxRates;
  // Set for the visitor's own list: rows can then be sorted, edited and removed.
  edit?: { save(entry: ListEntry): void; remove(symbol: string): void };
}

export function Holdings({ entries, stocks, valuation, fx, edit }: Props) {
  const { t } = useT();
  const f = useFormat();
  const [sort, setSort] = useState<SortKey>(edit ? storedSort : 'value');
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Without a single position there is nothing to value: the table becomes a plain watchlist.
  const valued = valuation.positions.length > 0;
  const sortKeys = valued ? SORT_KEYS : SORT_KEYS.filter((k) => k === 'day' || k === 'symbol');
  const rows = sortRows(listRows(entries, stocks, valuation), sortKeys.includes(sort) ? sort : 'symbol');
  const largest = Math.max(...valuation.positions.map((p) => p.weight));
  const currencies = [...new Set(valuation.positions.map((p) => p.stock.currency))].filter((c) => c !== 'EUR');
  const rates = currencies.map((c) => `1 EUR = ${f.num(fx.perEur[c], 4)} ${c}`).join(' · ');

  function chooseSort(key: SortKey) {
    setSort(key);
    storeSort(key);
  }

  function item(row: Row) {
    const { symbol } = row.entry;
    if (edit && editing === symbol) {
      return (
        <div key={symbol} className="hd-item hd-open">
          <EntryForm
            entry={row.entry}
            taken={[]}
            onSave={(entry) => {
              edit.save(entry);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      );
    }
    if (edit && removing === symbol) {
      return (
        <div key={symbol} className="hd-item hd-open">
          <ConfirmBar
            question={t('portfolio.rmAsk', { symbol: shortSymbol(symbol) })}
            confirmLabel={t('portfolio.rmYes')}
            onConfirm={() => {
              edit.remove(symbol);
              setRemoving(null);
            }}
            onCancel={() => setRemoving(null)}
          />
        </div>
      );
    }
    return (
      <HoldingRow
        key={symbol}
        row={row}
        valued={valued}
        largest={largest}
        actions={edit && { edit: () => setEditing(symbol), remove: () => (row.position || row.entry.note ? setRemoving(symbol) : edit.remove(symbol)) }}
      />
    );
  }

  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{t(valued ? 'portfolio.hold' : 'portfolio.watchTitle')}</PanelTitle>
        {edit && (
          <label className="hd-sort">
            <span>{t('portfolio.sort')}</span>
            <select className="fld" value={sortKeys.includes(sort) ? sort : 'symbol'} onChange={(e) => chooseSort(e.target.value as SortKey)}>
              {sortKeys.map((key) => <option key={key} value={key}>{t(`portfolio.sortBy.${key}`)}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="pnl-note">
        {valued ? t('portfolio.fxNote', { date: f.date(fx.date, 'UTC'), rates }) : t('portfolio.watchHint')}
      </p>
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <div className={`hd${valued ? '' : ' wl'}${edit ? ' ed' : ''}`}>
          <div className="lbl tbl-head hd-cols">
            <span>{t('portfolio.cSym')}</span>
            <span>{t('portfolio.cName')}</span>
            <span className="c-tr">{t('portfolio.cTrend')}</span>
            {valued && (
              <>
                <span className="r c-qty">{t('portfolio.cQty')}</span>
                <span className="r c-avg">{t('portfolio.cBuy')}</span>
              </>
            )}
            <span className="r">{t('portfolio.cPrice')}</span>
            {valued && <span className="r">{t('portfolio.cVal')}</span>}
            <span className="r">{t('portfolio.cDay')}</span>
            {valued && (
              <>
                <span className="r">{t('portfolio.cPl')}</span>
                <span className="c-w">{t('portfolio.cW')}</span>
              </>
            )}
          </div>
          {rows.map(item)}
          {valued && (
            <div className="tbl-row hd-cols tot" style={{ borderTop: '1px solid var(--ink3)', fontWeight: 600 }}>
              <span className="c-sym" />
              <span className="c-name">{t('portfolio.total')}</span>
              <span className="c-tr" />
              <span className="c-qty" />
              <span className="c-avg" />
              <span className="c-price" />
              <span className="num r c-val">{f.num(valuation.holdingsEur)} €</span>
              <span className={`num r c-day ${direction(valuation.dayPct)}`} style={{ fontSize: 12.5, paddingRight: 8 }}>{f.pct(valuation.dayPct)}</span>
              <span className={`num r c-pl ${direction(valuation.gainEur)}`} style={{ fontSize: 13 }}>
                {f.signed(valuation.gainEur)} € · {f.pct(valuation.gainPct, 1)}
              </span>
              <span className="c-w" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
