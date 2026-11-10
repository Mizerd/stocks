import { brand, type Lang } from '../config/brand';
import { useSettings } from '../settings';
import enCommon from './en/common.json';
import enOverview from './en/overview.json';
import enPortfolio from './en/portfolio.json';
import enScreener from './en/screener.json';
import enStock from './en/stock.json';
import ltCommon from './lt/common.json';
import ltOverview from './lt/overview.json';
import ltPortfolio from './lt/portfolio.json';
import ltScreener from './lt/screener.json';
import ltStock from './lt/stock.json';

const en = { common: enCommon, overview: enOverview, stock: enStock, portfolio: enPortfolio, screener: enScreener };
const lt: typeof en = { common: ltCommon, overview: ltOverview, stock: ltStock, portfolio: ltPortfolio, screener: ltScreener };
const messages: Record<Lang, typeof en> = { en, lt };

type Vars = Record<string, string | number>;

function lookup(lang: Lang, key: string): unknown {
  let node: unknown = messages[lang];
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return node;
}

// "{name}" placeholders; {brand} is always available.
function fill(text: string, vars?: Vars): string {
  return text.replace(/\{(\w+)\}/g, (_, name) => String(name === 'brand' ? brand.name : (vars?.[name] ?? '')));
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const value = lookup(lang, key);
  return typeof value === 'string' ? fill(value, vars) : key;
}

// t('overview.baro') for one string, list('overview.ranges') for an array of strings.
export function useT() {
  const { lang } = useSettings();
  return {
    lang,
    t: (key: string, vars?: Vars) => translate(lang, key, vars),
    list: (key: string) => (lookup(lang, key) as string[] | undefined) ?? [],
    table: (key: string) => (lookup(lang, key) as string[][] | undefined) ?? [],
  };
}
