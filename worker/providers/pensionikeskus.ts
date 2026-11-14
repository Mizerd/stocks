import { fundSymbol } from '../../shared/catalog';
import { zonedTime } from '../../shared/exchanges';
import type { Candle, FundCategory, Instrument } from '../../shared/types';
import { daysAgo, fetchBytes, fetchText, isoDay, shared, UpstreamError } from '../http';
import { fundProvider, type FundEntry } from './funds';

// Pensionikeskus, the Estonian pension registry, publishes the daily NAV of every Estonian II and III pillar
// pension fund as public statistics, with a tab-separated download for any funds and dates.
const BASE = 'https://www.pensionikeskus.ee/en/statistics';
const PILLARS = {
  ii: { path: 'ii-pillar/nav-of-funded-pension', category: 'pension2' },
  iii: { path: 'iii-pillar/nav-of-suppl-funded-pension', category: 'pension3' },
} as const satisfies Record<string, { path: string; category: FundCategory }>;
type Pillar = keyof typeof PILLARS;

const TIMEZONE = 'Europe/Tallinn';
const COMPANIES = ['LHV', 'Luminor', 'SEB', 'Swedbank', 'Tuleva'];

export interface PensionFundId {
  id: string;
  name: string;
}

// The statistics page lists each fund as a checkbox whose value is the fund's id in the download.
export function parsePensionFundIds(html: string): PensionFundId[] {
  return [...html.matchAll(/<input type="checkbox" value="(\d+)"[^>]*id="fund_\1"\s*\/>\s*<label for="fund_\d+">([^<]+)<\/label>/g)]
    .map((m) => ({ id: m[1], name: m[2].replaceAll('&amp;', '&').trim() }));
}

export interface NavRow {
  day: string;
  name: string;
  isin: string;
  nav: number;
}

// The download is UTF-16 text: Date, Fund, Shortname, ISIN, NAV (decimal comma), Change % since the first date.
export function parseNavRows(text: string): NavRow[] {
  const rows: NavRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [day, name, , isin, nav] = line.split('\t');
    const value = Number(nav?.replace(',', '.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isin || !(value > 0)) continue;
    rows.push({ day, name: name.trim(), isin: isin.trim(), nav: value });
  }
  return rows;
}

export function decodeUtf16(bytes: Uint8Array): string {
  const start = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
  // The native decoder is many times faster; the loop below is for runtimes without UTF-16 support.
  try {
    return new TextDecoder('utf-16le').decode(bytes.subarray(start));
  } catch {
    // Falls through.
  }
  const units = new Uint16Array(bytes.buffer, bytes.byteOffset + start, (bytes.length - start) >> 1);
  let text = '';
  for (let i = 0; i < units.length; i += 8192) text += String.fromCharCode(...units.subarray(i, i + 8192));
  return text;
}

async function navRows(pillar: Pillar, ids: string[], from: string, to = isoDay(new Date())): Promise<NavRow[]> {
  const funds = ids.map((id) => `f%5B%5D=${id}`).join('&');
  const url = `${BASE}/${PILLARS[pillar].path}/?download=xls&date_from=${from}&date_to=${to}&${funds}`;
  return parseNavRows(decodeUtf16(await fetchBytes(url)));
}

const companyOf = (name: string) => COMPANIES.find((c) => name.startsWith(`${c} `)) ?? name.split(' ')[0];

// Every fund of one pillar with its latest NAV, the one before it and the NAV of a year ago.
export function pensionEntries(pillar: Pillar, ids: PensionFundId[], recent: NavRow[], yearAgo: NavRow[]): FundEntry[] {
  const category = PILLARS[pillar].category;
  return ids.flatMap(({ id, name }) => {
    const own = recent.filter((r) => r.name === name);
    const last = own[own.length - 1];
    if (!last) return [];
    const prev = own[own.length - 2];
    const base = yearAgo.filter((r) => r.name === name).pop();
    const company = companyOf(name);
    const returns = { '1W': null, '1M': null, '3M': null, '6M': null, YTD: null, '1Y': base ? (last.nav / base.nav - 1) * 100 : null, '3Y': null, '5Y': null };
    return [{
      inst: {
        symbol: fundSymbol(last.isin), name, kind: 'fund', exchange: 'XTAL', currency: 'EUR', region: 'BAL',
        provider: 'pensionikeskus', providerId: `${pillar}:${id}`, isin: last.isin, company, category,
      },
      facts: {
        isin: last.isin, company, category, navDate: last.day, ongoingCharge: null, risk: null, inception: null,
        benchmark: null, indexFund: null, returns, history: true, source: 'pensionikeskus',
      },
      price: last.nav,
      prevClose: prev?.nav ?? null,
      time: zonedTime(last.day, '18:00', TIMEZONE).toISOString(),
    } satisfies FundEntry];
  });
}

async function pillarFunds(pillar: Pillar): Promise<FundEntry[]> {
  const ids = parsePensionFundIds(await fetchText(`${BASE}/${PILLARS[pillar].path}/`, 'text/html'));
  if (ids.length === 0) throw new UpstreamError(`Pensionikeskus lists no ${pillar} pillar funds`);
  const all = ids.map((f) => f.id);
  const [recent, yearAgo] = await Promise.all([
    navRows(pillar, all, isoDay(daysAgo(14))),
    navRows(pillar, all, isoDay(daysAgo(379)), isoDay(daysAgo(365))),
  ]);
  return pensionEntries(pillar, ids, recent, yearAgo);
}

export function estonianPensionFunds(): Promise<FundEntry[]> {
  return shared('funds:pensionikeskus', 3 * 3600, async () => {
    const lists = await Promise.all((Object.keys(PILLARS) as Pillar[]).map(pillarFunds));
    return lists.flat();
  }, 2 * 24 * 3600);
}

async function navHistory(inst: Instrument, years: number): Promise<Candle[]> {
  const [pillar, id] = inst.providerId.split(':') as [Pillar, string];
  if (!PILLARS[pillar] || !/^\d+$/.test(id)) throw new UpstreamError(`Unknown pension fund ${inst.symbol}`);
  const rows = await navRows(pillar, [id], isoDay(daysAgo(Math.round(years * 365.25))));
  return rows.map((r) => ({ t: Date.parse(r.day), o: r.nav, h: r.nav, l: r.nav, c: r.nav, v: null }));
}

export const pensionikeskus = fundProvider(estonianPensionFunds, navHistory);
