import { shortSymbol } from '../../../shared/catalog';
import { EXCHANGES } from '../../../shared/exchanges';
import type { FxRates, StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { capEur } from '../../lib/screener';

interface Cell {
  text: string;
  className?: string;
  bold?: boolean;
}

// Marks the highest (or lowest) known value; nothing is marked when there is only one stock.
function markBest(cells: Cell[], values: (number | null)[], want: 'high' | 'low'): Cell[] {
  const known = values.filter((v) => v !== null);
  if (values.length < 2 || known.length === 0) return cells;
  const best = want === 'high' ? Math.max(...known) : Math.min(...known);
  return cells.map((cell, i) => ({ ...cell, bold: values[i] === best }));
}

export function SideBySide({ picked, fx }: { picked: StockSummary[]; fx: FxRates | undefined }) {
  const { t, list } = useT();
  const f = useFormat();
  const columns = `minmax(104px, 1fr) repeat(${picked.length}, minmax(76px, 1fr))`;

  const figures = (format: (stock: StockSummary) => string) =>
    picked.map((stock): Cell => ({ text: format(stock), className: 'num' }));
  const signedFigures = (value: (stock: StockSummary) => number | null, decimals: number) =>
    picked.map((stock): Cell => ({ text: f.pct(value(stock), decimals), className: `num ${direction(value(stock))}` }));

  const rows: Cell[][] = [
    picked.map((stock) => ({ text: EXCHANGES[stock.exchange].short })),
    picked.map((stock) => ({ text: stock.currency })),
    figures((stock) => f.price(stock.price)),
    markBest(signedFigures((stock) => stock.changePct, 2), picked.map((stock) => stock.changePct), 'high'),
    markBest(figures((stock) => f.big(stock.marketCap)), picked.map((stock) => capEur(stock, fx)), 'high'),
    markBest(figures((stock) => f.num(stock.pe, 1)), picked.map((stock) => stock.pe), 'low'),
    markBest(figures((stock) => f.plainPct(stock.dividendYield)), picked.map((stock) => stock.dividendYield), 'high'),
    markBest(signedFigures((stock) => stock.return1Y, 1), picked.map((stock) => stock.return1Y), 'high'),
    figures((stock) => f.price(stock.low52)),
    figures((stock) => f.price(stock.high52)),
  ];
  const labels = list('screener.mk');

  return (
    <div className="pnl" style={{ flex: '1 1 430px' }}>
      <h2 className="ser pnl-title" style={{ marginBottom: 10 }}>{t('screener.side')}</h2>
      <div className="scroll-x">
        <div style={{ minWidth: 104 + 84 * picked.length }}>
          <div className="num" style={{ display: 'grid', gridTemplateColumns: columns, gap: 8, padding: '8px 0', borderBottom: '1px solid var(--hair)', fontWeight: 600 }}>
            <span className="sbs-k" />
            {picked.map((stock) => (
              <span key={stock.symbol} style={{ textAlign: 'right' }}>{shortSymbol(stock.symbol)}</span>
            ))}
          </div>
          {rows.map((cells, i) => (
            <div
              key={labels[i]}
              style={{ display: 'grid', gridTemplateColumns: columns, alignItems: 'baseline', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--hair)' }}
            >
              <span className="sbs-k" style={{ color: 'var(--ink2)', alignSelf: 'stretch' }}>{labels[i]}</span>
              {cells.map((cell, j) => (
                <span key={picked[j].symbol} className={cell.className} style={{ fontSize: 13, textAlign: 'right', fontWeight: cell.bold ? 600 : 400 }}>
                  {cell.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('screener.sideNote')}</p>
    </div>
  );
}
