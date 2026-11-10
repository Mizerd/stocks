import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { Badge } from '../ui';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { MAX_PICKS, SORT_KEYS, type SortKey } from '../../lib/screener';

const COLUMNS = '24px 64px minmax(120px, 1.5fr) minmax(110px, 1.1fr) 104px 88px 120px 50px 62px 78px';
const TEXT_COLUMNS = 3;
const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const figure = { fontSize: 12.5, textAlign: 'right' } as const;

interface ResultsTableProps {
  stocks: StockSummary[];
  sort: SortKey;
  desc: boolean;
  picks: string[];
  onSort(key: SortKey): void;
  onTogglePick(symbol: string): void;
}

export function ResultsTable({ stocks, sort, desc, picks, onSort, onTogglePick }: ResultsTableProps) {
  const { t, list } = useT();
  const f = useFormat();
  const heads = list('screener.heads');

  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <div style={{ minWidth: 920 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 10, padding: 8, borderBottom: '1px solid var(--ink)' }}>
          <span />
          {SORT_KEYS.map((key, i) => (
            <button
              key={key}
              className={`th ${sort === key ? 'on' : ''}`}
              style={{ justifyContent: i < TEXT_COLUMNS ? 'flex-start' : 'flex-end' }}
              onClick={() => onSort(key)}
            >
              {heads[i]}
              {sort === key && <span aria-hidden="true">{desc ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>

        {stocks.map((stock) => {
          const picked = picks.includes(stock.symbol);
          const name = shortSymbol(stock.symbol);
          return (
            <div
              key={stock.symbol}
              className="row"
              style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 10, height: 44, padding: '0 8px', borderBottom: '1px solid var(--hair)' }}
            >
              <input
                className="ck"
                type="checkbox"
                aria-label={`${t('screener.pickL')}: ${name}`}
                checked={picked}
                disabled={!picked && picks.length >= MAX_PICKS}
                onChange={() => onTogglePick(stock.symbol)}
              />
              <Link to={`/stock/${stock.symbol}`} className="num hl" style={{ fontWeight: 500 }}>{name}</Link>
              <span style={clip}>{stock.name}</span>
              <span style={{ ...clip, fontSize: 13, color: 'var(--ink2)' }}>
                {stock.sector && t(`screener.sec.${stock.sector}`)}
              </span>
              <span className="num" style={{ textAlign: 'right' }}>
                {f.price(stock.price)} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{stock.currency}</span>
              </span>
              <span style={{ textAlign: 'right' }}><Badge value={stock.changePct} /></span>
              <span className="num" style={figure}>
                {f.big(stock.marketCap)}
                {stock.marketCap !== null && <span style={{ fontSize: 11, color: 'var(--ink3)' }}> {stock.currency}</span>}
              </span>
              <span className="num" style={figure}>{f.num(stock.pe, 1)}</span>
              <span className="num" style={figure}>{f.plainPct(stock.dividendYield)}</span>
              <span className={`num ${direction(stock.return1Y)}`} style={figure}>{f.pct(stock.return1Y, 1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
