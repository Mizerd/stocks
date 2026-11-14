import { useEffect, useState } from 'react';
import type { FundRow, StockSummary } from '../../shared/types';
import { fetchJson } from './api';

// Every covered fund with its latest NAV (/api/funds). NAVs are published once a day, so the list
// is loaded once per visit.

let funds: Promise<FundRow[]> | undefined;
let loaded: FundRow[] = [];
// Fund sources that did not answer.
let failed: string[] = [];

export function loadFunds(): Promise<FundRow[]> {
  funds ??= fetchJson<{ items: FundRow[]; failed: string[] }>('/api/funds').then((r) => {
    failed = r.failed;
    return (loaded = r.items);
  });
  funds.catch(() => (funds = undefined));
  return funds;
}

// The funds loaded so far, read without starting a load.
export const loadedFunds = () => loaded;

interface FundsState {
  funds: FundRow[] | null;
  failed: string[];
  error: boolean;
}

export function useFunds(): FundsState {
  const [state, setState] = useState<FundsState>({ funds: loaded.length ? loaded : null, failed, error: false });
  useEffect(() => {
    let alive = true;
    loadFunds().then(
      (items) => alive && setState({ funds: items, failed, error: false }),
      () => alive && setState({ funds: [], failed: [], error: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// A fund in the shape the list and the search read stocks in. Figures a NAV list has no use for are null.
export function fundSummary(row: FundRow): StockSummary {
  const { isin: _isin, navDate: _navDate, ongoingCharge: _fee, risk: _risk, history: _history, change, changePct, ...listing } = row;
  return {
    ...listing,
    change: change ?? 0,
    changePct: changePct ?? 0,
    prevClose: row.price - (change ?? 0),
    open: null, high: null, low: null, volume: null, freshness: 'eod',
    marketCap: null, pe: null, eps: null, dividend: null, dividendYield: null, avgVolume: null,
    high52: null, low52: null, spark: [],
  };
}

export function fundCompanies(rows: FundRow[]): string[] {
  return [...new Set(rows.map((r) => r.company ?? ''))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// "Swedbank Robur Access Edge Global C" -> "Access Edge Global C" where the company is shown beside it.
export function withoutCompany(name: string, company: string | undefined): string {
  return company && name.startsWith(`${company} `) ? name.slice(company.length + 1) : name;
}
