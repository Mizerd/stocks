import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { StockSummary } from '../../../shared/types';
import { Badge } from '../ui';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import { dayMove } from '../../lib/market';
import { MAX_PICKS, SORT_KEYS, type SortKey } from '../../lib/screener';

const TEXT_COLUMNS = 3;
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
  const now = new Date();

  return (
    <div className="scroll-x" style={{ marginTop: 10 }}>
      <div className="rt">
        <div className="tbl-head rt-cols">
          <span />
          {SORT_KEYS.map((key, i) => (
            <button
              key={key}
              className={`th${sort === key ? ' on' : ''}${key === 'sector' ? ' c-sec' : ''}`}
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
            <div key={stock.symbol} className="row tbl-row rt-cols">
              <label className="c-ck ck-hit">
                <input
                  className="ck"
                  type="checkbox"
                  aria-label={`${t('screener.pickL')}: ${name}`}
                  checked={picked}
                  disabled={!picked && picks.length >= MAX_PICKS}
                  onChange={() => onTogglePick(stock.symbol)}
                />
              </label>
              <Link to={`/stock/${stock.symbol}`} className="num hl c-sym" style={{ fontWeight: 600 }}>{name}</Link>
              <span className="clip c-name">{stock.name}</span>
              <span className="clip c-sec" style={{ fontSize: 13, color: 'var(--ink2)' }}>
                {stock.sector && t(`screener.sec.${stock.sector}`)}
              </span>
              <span className="num r c-price">
                {f.price(stock.price)} <span className="cur">{stock.currency}</span>
              </span>
              <span className="r c-chg"><Badge value={dayMove(stock, now)} /></span>
              {/* Small labels name the figures on phones, where the header row is a row of sort buttons. */}
              <span className="num c-cap" style={figure}>
                <span className="rt-k">{heads[5]}</span>
                {f.big(stock.marketCap)}
                {stock.marketCap !== null && <span className="cur"> {stock.currency}</span>}
              </span>
              <span className="num c-pe" style={figure}><span className="rt-k">{heads[6]}</span>{f.num(stock.pe, 1)}</span>
              <span className="num c-dy" style={figure}><span className="rt-k">{heads[7]}</span>{f.plainPct(stock.dividendYield)}</span>
              <span className={`num c-1y ${direction(stock.return1Y)}`} style={figure}><span className="rt-k">{heads[8]}</span>{f.pct(stock.return1Y, 1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
