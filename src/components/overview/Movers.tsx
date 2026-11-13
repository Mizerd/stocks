import { useState } from 'react';
import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { FxRates, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { turnoverEur } from '../../lib/market';
import { prefetchProps } from '../../lib/prefetch';
import { PanelTitle, Seg } from '../ui';

type Tab = 'gainers' | 'losers' | 'active';

export function Movers({ stocks, fx }: { stocks: StockSummary[]; fx: FxRates | undefined }) {
  const { t, list } = useT();
  const f = useFormat();
  const [tab, setTab] = useState<Tab>('gainers');
  const labels = list('overview.mv');

  let rows: { stock: StockSummary; figure: number }[];
  if (tab === 'active') {
    rows = stocks
      .map((stock) => ({ stock, figure: turnoverEur(stock, fx) ?? 0 }))
      .filter((r) => r.figure > 0)
      .sort((a, b) => b.figure - a.figure);
  } else {
    const sign = tab === 'gainers' ? 1 : -1;
    rows = stocks
      .filter((s) => s.changePct * sign > 0)
      .sort((a, b) => (b.changePct - a.changePct) * sign)
      .map((stock) => ({ stock, figure: stock.changePct }));
  }
  rows = rows.slice(0, 5);
  const largest = Math.max(...rows.map((r) => Math.abs(r.figure)), 0);

  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle small>{t('overview.movers')}</PanelTitle>
        <Seg
          label={t('overview.movers')}
          value={tab}
          onChange={setTab}
          options={[{ value: 'gainers', label: labels[0] }, { value: 'losers', label: labels[1] }, { value: 'active', label: labels[2] }]}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        {rows.map(({ stock, figure }) => (
          <Link
            key={stock.symbol}
            to={`/stock/${stock.symbol}`}
            className="row tbl-row"
            style={{ gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, minHeight: 50, padding: '0 6px' }}
            {...prefetchProps(stock.symbol)}
          >
            <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{shortSymbol(stock.symbol)}</span>
            {/* The bar sits under the name, so the name keeps the row's width. */}
            <span style={{ minWidth: 0 }}>
              <span className="clip" style={{ display: 'block', fontSize: 13, color: 'var(--ink2)' }}>{stock.name}</span>
              <span style={{ display: 'block', height: 4, marginTop: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--sel)' }}>
                <span
                  style={{
                    display: 'block', width: `${(Math.abs(figure) / largest) * 100}%`, height: '100%', borderRadius: 2,
                    background: tab === 'active' ? 'var(--ink)' : tab === 'gainers' ? 'var(--up)' : 'var(--down)',
                  }}
                />
              </span>
            </span>
            <span className={`num ${tab === 'active' ? '' : direction(figure)}`} style={{ minWidth: 64, fontSize: 13, fontWeight: 500, textAlign: 'right' }}>
              {tab === 'active' ? `${f.big(figure)} €` : f.pct(figure)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
