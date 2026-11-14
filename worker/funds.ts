import { isFundSymbol, toListing } from '../shared/catalog';
import type { FundRow } from '../shared/types';
import type { FundEntry } from './providers/funds';
import { estonianPensionFunds } from './providers/pensionikeskus';

// Every fund source with its list. A fund's symbol is its ISIN, so lists cannot clash with stocks.
// Swedbank Robur (providers/robur.ts) is left out until the owner decides on its Morningstar-run list.
const SOURCES: { id: string; list(): Promise<FundEntry[]> }[] = [
  { id: 'pensionikeskus', list: estonianPensionFunds },
];

export async function fundEntries(): Promise<{ items: FundEntry[]; failed: string[] }> {
  const results = await Promise.allSettled(SOURCES.map((s) => s.list()));
  const seen = new Set<string>();
  const items: FundEntry[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const entry of result.value) {
      if (seen.has(entry.inst.symbol)) continue;
      seen.add(entry.inst.symbol);
      items.push(entry);
    }
  }
  return { items, failed: SOURCES.filter((_, i) => results[i].status === 'rejected').map((s) => s.id) };
}

export function toFundRow({ inst, facts, price, prevClose, time }: FundEntry): FundRow {
  const change = prevClose === null ? null : price - prevClose;
  return {
    ...toListing(inst), isin: facts.isin, navDate: facts.navDate, price, change,
    changePct: change === null || !prevClose ? null : (change / prevClose) * 100, time,
    ongoingCharge: facts.ongoingCharge, risk: facts.risk, return1Y: facts.returns['1Y'], history: facts.history,
  };
}

// Only a fund on one of the lists resolves; the identifiers sent upstream always come from the list.
export async function findFund(input: string): Promise<FundEntry | undefined> {
  const symbol = input.trim().toUpperCase();
  if (!isFundSymbol(symbol)) return undefined;
  for (const source of SOURCES) {
    const match = (await source.list().catch(() => [])).find((e) => e.inst.symbol === symbol);
    if (match) return match;
  }
  return undefined;
}
