import type { Candle, FundCategory, FundPeriod } from './types';

export const FUND_PERIODS: FundPeriod[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];

export const FUND_CATEGORIES: FundCategory[] = ['equity', 'bond', 'mixed', 'pension2', 'pension3'];

const DAY = 24 * 3600 * 1000;
const PERIOD_DAYS: Record<Exclude<FundPeriod, 'YTD'>, number> = {
  '1W': 7, '1M': 31, '3M': 92, '6M': 183, '1Y': 365, '3Y': 3 * 365, '5Y': 5 * 365,
};

// Cumulative return over each period from a daily NAV series (oldest first), measured from the last NAV
// on or before the period's start. Null where the series does not reach back that far.
export function fundReturns(navs: Candle[], now = Date.now()): Record<FundPeriod, number | null> {
  const last = navs[navs.length - 1];
  const returns = {} as Record<FundPeriod, number | null>;
  for (const period of FUND_PERIODS) {
    const from = period === 'YTD' ? Date.UTC(new Date(now).getUTCFullYear(), 0, 1) - 1 : now - PERIOD_DAYS[period] * DAY;
    let base: Candle | undefined;
    for (const c of navs) {
      if (c.t > from) break;
      base = c;
    }
    returns[period] = last && base && base.c > 0 ? (last.c / base.c - 1) * 100 : null;
  }
  return returns;
}
