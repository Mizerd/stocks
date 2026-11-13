import type { CompanyAbout, Instrument } from '../../shared/types';
import { cachedJson, cachedText } from '../http';

type Lang = 'lt' | 'en';
const DAY_SECONDS = 24 * 3600;

// Lithuanian articles the English page does not link to (Akola has no English article),
// or links to wrongly (Telia Lietuva points at its predecessor Omnitel): null keeps English.
const LT_TITLES: Record<string, string | null> = {
  'AKO1L.VS': 'Akola group',
  'TEL1L.VS': null,
};

const summaryUrl = (lang: Lang, title: string) =>
  `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`;

const langLinkUrl = (title: string) =>
  `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=lt&redirects=1&format=json&titles=${encodeURIComponent(title)}`;

// Wikipedia's REST page summary. Disambiguation pages and empty extracts are no use here.
export function parseSummary(body: string, lang: Lang): CompanyAbout | null {
  const page = JSON.parse(body);
  const extract = typeof page.extract === 'string' ? page.extract.replace(/\s+/g, ' ').trim() : '';
  const url = page.content_urls?.desktop?.page;
  if (page.type !== 'standard' || !extract || typeof url !== 'string' || !url.startsWith(`https://${lang}.wikipedia.org/`)) return null;
  return { extract, description: typeof page.description === 'string' ? page.description : null, url, lang };
}

// Title of the Lithuanian article linked from an English page, from the action API's langlinks.
export function parseLangLink(body: string): string | null {
  const pages = Object.values(JSON.parse(body).query?.pages ?? {}) as { langlinks?: { '*'?: string }[] }[];
  return pages[0]?.langlinks?.[0]?.['*'] ?? null;
}

const WIKIDATA = 'https://www.wikidata.org/w/api.php?format=json&action=';
// Wikidata items of the two US exchanges, for stocks found by name.
const EXCHANGE_ITEMS: Record<string, string> = { XNAS: 'Q82059', XNYS: 'Q13677' };

function isinOf(inst: Instrument): string | undefined {
  if (inst.provider === 'baltic') return inst.providerId;
  if (inst.provider === 'euronext') return inst.providerId.split('-')[0];
  return inst.isin;
}

// The search text that finds exactly the company's Wikidata item: its ISIN, or its name and exchange.
export function wikidataQuery(inst: Instrument): string | null {
  const isin = isinOf(inst);
  if (isin) return `haswbstatement:P946=${isin}`;
  const exchange = EXCHANGE_ITEMS[inst.exchange];
  return exchange ? `${inst.name.replace(/[^\p{L}\p{N}&.' -]/gu, ' ')} haswbstatement:P414=${exchange}` : null;
}

// English and Lithuanian article titles of the one item a search found; nothing when it is ambiguous.
export function parseSitelinks(body: any): { en: string | null; lt: string | null } {
  const entity = Object.values(body?.entities ?? {})[0] as { sitelinks?: Record<string, { title: string }> } | undefined;
  return { en: entity?.sitelinks?.enwiki?.title ?? null, lt: entity?.sitelinks?.ltwiki?.title ?? null };
}

async function wikidataTitles(inst: Instrument) {
  const query = wikidataQuery(inst);
  if (!query) return null;
  const search = await cachedJson(`${WIKIDATA}query&list=search&srlimit=2&srprop=&srsearch=${encodeURIComponent(query)}`, DAY_SECONDS);
  const hits = search?.query?.search ?? [];
  if (hits.length !== 1) return null;
  const item = encodeURIComponent(hits[0].title);
  return parseSitelinks(await cachedJson(`${WIKIDATA}wbgetentities&props=sitelinks&sitefilter=enwiki|ltwiki&ids=${item}`, DAY_SECONDS));
}

async function summary(lang: Lang, title: string): Promise<CompanyAbout | null> {
  return parseSummary(await cachedText(summaryUrl(lang, title), DAY_SECONDS), lang);
}

async function lithuanianTitle(inst: Instrument): Promise<string | null> {
  if (inst.symbol in LT_TITLES) return LT_TITLES[inst.symbol];
  return inst.wiki ? parseLangLink(await cachedText(langLinkUrl(inst.wiki), DAY_SECONDS)) : null;
}

// A short encyclopedic summary of the company, in Lithuanian when asked for and available.
// Catalogue stocks name their article; other stocks are looked up on Wikidata.
export async function about(inst: Instrument, lang: Lang): Promise<CompanyAbout | null> {
  const found = inst.wiki ? null : await wikidataTitles(inst).catch(() => null);
  if (lang === 'lt') {
    const local = await (found ? Promise.resolve(found.lt) : lithuanianTitle(inst))
      .then((title) => (title ? summary('lt', title) : null))
      .catch(() => null);
    if (local) return local;
  }
  const english = inst.wiki ?? found?.en;
  return english ? summary('en', english) : null;
}
