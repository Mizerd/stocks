import { Link } from 'react-router-dom';
import type { FundRow } from '../../../shared/types';
import { useT } from '../../i18n';
import { DASH, direction, useFormat } from '../../lib/format';
import { prefetchProps } from '../../lib/prefetch';
import { FUND_SORT_KEYS, type FundSortKey } from '../../lib/screener';
import { Badge } from '../ui';

const HEADS: Record<FundSortKey, string> = {
  name: 'cName', type: 'cType', nav: 'cNav', day: 'cDay', ret: 'cRet', fee: 'cFee', risk: 'cRisk',
};
const TEXT_KEYS: FundSortKey[] = ['name', 'type'];
const figure = { fontSize: 12.5, textAlign: 'right' } as const;

interface Props {
  funds: FundRow[];
  sort: FundSortKey;
  desc: boolean;
  onSort(key: FundSortKey): void;
}

// The screener's fund list: NAV, the last day's change, the 1-year return, fees and risk class.
export function FundResults({ funds, sort, desc, onSort }: Props) {
  const { t } = useT();
  const f = useFormat();
  const head = (key: FundSortKey) => t(`screener.fund.${HEADS[key]}`);

  return (
    <div className="scroll-x" style={{ marginTop: 10 }}>
      <div className="ft">
        <div className="tbl-head ft-cols">
          {FUND_SORT_KEYS.map((key) => (
            <button
              key={key}
              className={`th${sort === key ? ' on' : ''}${key === 'type' ? ' c-type' : ''}`}
              style={{ justifyContent: TEXT_KEYS.includes(key) ? 'flex-start' : 'flex-end' }}
              onClick={() => onSort(key)}
            >
              {head(key)}
              {sort === key && <span aria-hidden="true">{desc ? '↓' : '↑'}</span>}
            </button>
          ))}
        </div>
        {funds.map((fund) => (
          <div key={fund.symbol} className="row tbl-row ft-cols">
            <Link to={`/stock/${fund.symbol}`} className="hl c-name" style={{ minWidth: 0 }} {...prefetchProps(fund.symbol)}>
              <span className="clip" style={{ display: 'block', fontWeight: 600 }}>{fund.name}</span>
              <span className="clip c-co">{fund.company} · <span className="num">{fund.isin}</span></span>
            </Link>
            <span className="c-type" style={{ fontSize: 13, lineHeight: 1.25, color: 'var(--ink2)' }}>
              {fund.category && t(`screener.fund.cat.${fund.category}`)}
            </span>
            <span className="num r c-price">
              {f.price(fund.price)} <span className="cur">{fund.currency}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{f.dateShort(`${fund.navDate}T12:00:00Z`, 'UTC')}</span>
            </span>
            <span className="r c-chg"><Badge value={fund.changePct} /></span>
            <span className={`num c-1y ${direction(fund.return1Y)}`} style={figure}><span className="rt-k">{head('ret')}</span>{f.pct(fund.return1Y, 1)}</span>
            <span className="num c-fee" style={figure}><span className="rt-k">{head('fee')}</span>{f.plainPct(fund.ongoingCharge)}</span>
            <span className="num c-risk" style={figure}><span className="rt-k">{head('risk')}</span>{fund.risk === null ? DASH : `${fund.risk}/7`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
