import { fundSymbol } from '../../shared/catalog';
import { zonedTime } from '../../shared/exchanges';
import type { FundCategory, FundFacts } from '../../shared/types';
import { fetchText, shared, UpstreamError } from '../http';
import { fundProvider, type FundEntry } from './funds';

// Swedbank Robur's own public fund list (linked as "Fonder och kurser" from swedbankrobur.se). The page
// carries every share class with its latest NAV, published returns, ongoing charges and risk indicator.
// It publishes no NAV history without an API key, so these funds have no chart.
const LIST_URL = 'https://swedbankrobur.fondlista.se/en';
const COMPANY = 'Swedbank Robur';
const TIMEZONE = 'Europe/Stockholm';

const CATEGORIES: Record<string, FundCategory> = {
  $$BCG$EQUTY: 'equity', $$BCG$FXINC: 'bond', $$BCG$ALLOC: 'mixed',
};

const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const textOrNull = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// The list sits in the page as the server-rendered query state of a Next.js app: a JSON object, escaped
// inside a JavaScript string. Only that slice is unescaped and parsed.
export function parseRoburList(html: string, now = Date.now()): FundEntry[] {
  const start = html.indexOf('{\\"total\\":');
  const end = start < 0 ? -1 : html.indexOf(',\\"dataUpdateCount\\"', start);
  if (end < 0) return [];
  const data = JSON.parse(JSON.parse(`"${html.slice(start, end)}"`));
  const entries: FundEntry[] = [];
  for (const row of data.rows ?? []) {
    const isin = textOrNull(row.isin);
    const price = numOrNull(row.closePrice);
    const navDate = textOrNull(row.closePriceDate);
    const category = CATEGORIES[row.globalAssetClassId];
    if (!isin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) || !price || !navDate || !/^\d{4}-\d{2}-\d{2}$/.test(navDate) || !category) continue;
    const day = numOrNull(row.returnD1);
    const facts: FundFacts = {
      isin,
      company: COMPANY,
      category,
      navDate,
      ongoingCharge: numOrNull(row.ongoingCharge),
      risk: numOrNull(row.summaryRiskIndicator),
      inception: textOrNull(row.inceptionDate),
      benchmark: textOrNull(row.customAttributes29),
      indexFund: typeof row.indexFund === 'boolean' ? row.indexFund : null,
      returns: {
        '1W': numOrNull(row.returnW1), '1M': numOrNull(row.returnM1), '3M': numOrNull(row.returnM3),
        '6M': numOrNull(row.returnM6), YTD: numOrNull(row.returnM0), '1Y': numOrNull(row.returnM12),
        '3Y': numOrNull(row.returnM36UA), '5Y': numOrNull(row.returnM60UA),
      },
      history: false,
      source: 'robur',
    };
    entries.push({
      inst: {
        symbol: fundSymbol(isin), name: String(row.name ?? isin).trim(), kind: 'fund', exchange: 'XSTO',
        currency: String(row.currency ?? 'SEK'), region: 'EU', provider: 'robur', providerId: isin, isin, company: COMPANY, category,
      },
      facts,
      price,
      prevClose: day === null ? null : price / (1 + day / 100),
      time: zonedTime(navDate, '18:00', TIMEZONE).toISOString(),
    });
  }
  // A NAV more than a month old belongs to a closed or suspended share class.
  return entries.filter((e) => now - Date.parse(e.facts.navDate) < 31 * 24 * 3600 * 1000);
}

// The NAVs change once a day, so the parsed list is kept for hours in each data centre.
export function roburFunds(): Promise<FundEntry[]> {
  return shared('funds:robur', 3 * 3600, async () => {
    const entries = parseRoburList(await fetchText(LIST_URL, 'text/html', { timeoutMs: 15000 }));
    if (entries.length === 0) throw new UpstreamError('The Swedbank Robur fund list is unavailable');
    return entries;
  }, 2 * 24 * 3600);
}

export const robur = fundProvider(roburFunds, async () => []);
