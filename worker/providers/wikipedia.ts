import type { CompanyAbout, Instrument } from '../../shared/types';
import { cachedText } from '../http';

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

async function summary(lang: Lang, title: string): Promise<CompanyAbout | null> {
  return parseSummary(await cachedText(summaryUrl(lang, title), DAY_SECONDS), lang);
}

async function lithuanianTitle(inst: Instrument): Promise<string | null> {
  if (inst.symbol in LT_TITLES) return LT_TITLES[inst.symbol];
  return inst.wiki ? parseLangLink(await cachedText(langLinkUrl(inst.wiki), DAY_SECONDS)) : null;
}

// A short encyclopedic summary of the company, in Lithuanian when asked for and available.
export async function about(inst: Instrument, lang: Lang): Promise<CompanyAbout | null> {
  if (lang === 'lt') {
    const local = await lithuanianTitle(inst)
      .then((title) => (title ? summary('lt', title) : null))
      .catch(() => null);
    if (local) return local;
  }
  return inst.wiki ? summary('en', inst.wiki) : null;
}
