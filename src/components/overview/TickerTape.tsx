import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { direction, useFormat } from '../../lib/format';

export function TickerTape({ items }: { items: StockSummary[] }) {
  const f = useFormat();
  if (items.length === 0) return null;
  // Rendered twice so the loop is seamless.
  const doubled = [...items, ...items];
  return (
    <div aria-hidden="true" style={{ overflow: 'hidden', padding: '9px 0', borderBottom: '1px solid var(--hair)' }}>
      <div className="tape">
        {doubled.map((item, i) => (
          <span key={i} className="num" style={{ display: 'flex', gap: 8, paddingRight: 36, fontSize: 12, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 500 }}>{item.kind === 'index' ? item.name : shortSymbol(item.symbol)}</span>
            <span style={{ color: 'var(--ink2)' }}>{f.price(item.price)}</span>
            <span className={direction(item.changePct)}>{f.pct(item.changePct)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
