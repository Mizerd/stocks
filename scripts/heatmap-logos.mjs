// Finds free text logos for the heatmap's stocks and serves them from the site itself (the browser never asks
// another host). Run by hand about quarterly, after npm run heatmap:data (which writes scripts/heatmap/ids.json),
// review the contact sheet it writes (outside the repo) and commit the result. Never in CI: Wikimedia rate-limits,
// so every call is paced and a refusal (429) waits as long as the server asks, longer each time.
//
//   node scripts/heatmap-logos.mjs [contact-sheet.html]
//
// 1. Wikidata items of each stock: by ISIN (P946), by ticker on its exchange (P414 + P249), by the English
//    Wikipedia article of hand-checked stocks, and, for the rest, by exact name with the same exchange and ticker,
//    the same exchange, or the exchange's country. Items dissolved (P576), or replaced by another
//    match (its P1365 or their P1366), are left out, and so are items under a name unrelated to the stock's (a renamed
//    company or a reused ticker).
// 2. Logo of an item (P154): never a deprecated statement or one whose end time (P582) has passed; preferred rank
//    first; where statements give a start time (P580), only the latest. Files whose name dates them to a past
//    period ("1961-2019", "until 2025") or calls them old are left out. Without a usable logo of its own, a national
//    subsidiary named after its parent takes the parent's (P749/P127) or brand's (P1716) ("Telia Lietuva" → "Telia Company").
// 3. Kept only when Commons marks the file public domain or CC0 with one of the copyright tags in TAGS, as an SVG
//    of at most 48 KB without embedded raster images or letters set in a font.
// 4. Each file is cleaned of scripts and outside links, cropped to its drawing (needs Playwright; skipped without it)
//    and saved as public/logos/<first 8 hex of the file's sha1>.svg. A drawing cut off at the file's edge is left out.
//    A logo that a one-colour mask would turn into a blot (lettering inside a filled shape) is shown as drawn on a
//    light badge instead (mode "badge").
// 5. public/logos/credits.json lists file, source page, licence, author and mode; public/data/heatmap.json gets each
//    stock's logo id, aspect ratio (logoRatio) and, for badges, logoMode.
//
// scripts/heatmap/logo-denylist.json: {"files": {file: reason}, "stocks": {symbol: reason}} never used, and
// "confirmed": {symbol: reason}, matches checked by hand although the names differ ("Maplebear" trades as Instacart);
// scripts/heatmap/logo-modes.json: {file: "mask" | "badge"} overrides the automatic choice.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runnerImport } from 'vite';

const META = 'public/data/heatmap.json';
const IDS = 'scripts/heatmap/ids.json';
const DENYLIST = 'scripts/heatmap/logo-denylist.json';
const MODES = 'scripts/heatmap/logo-modes.json';
const LOGOS = 'public/logos';
const SHEET = process.argv[2] ?? join(tmpdir(), 'logo-sheet.html');
// Commons answers kept between runs for a week, so a re-run asks only for new files.
const CACHE = join(tmpdir(), 'heatmap-logos-commons.json');
const { brand } = (await runnerImport('./src/config/brand.ts')).module;
const USER_AGENT = `stocks-viewer/1.0 (+${brand.siteUrl.replace(/^https?:\/\//, '')}; logos, paced)`;
const MAX_BYTES = 48 * 1024;
const TODAY = new Date().toISOString().slice(0, 10);

// Copyright tags accepted, each meaning nobody holds a copyright in the file: too simple to be protected
// (PD-textlogo, PD-simple, PD-ineligible, and PD-shape for plain geometric marks) or released by its author (CC0).
// PD-self alone is not accepted: on a company's logo it is an uploader's claim to be the author, which Commons cannot
// check. Trademark notices are fine next to one of these: the site names companies only to identify them.
// Tags that limit the public-domain status to the United States refuse a file even next to an accepted one.
const US_ONLY = ['PD-ineligible-USonly', 'PD-USonly', 'PD-textlogo-USonly'];
const TAGS = { 'PD-textlogo': 'PD-textlogo', 'PD-text': 'PD-textlogo', 'PD-simple': 'PD-simple', 'PD-ineligible': 'PD-ineligible', 'PD-shape': 'PD-shape', 'Cc-zero': 'CC0', 'CC-zero': 'CC0', CC0: 'CC0' };

const meta = JSON.parse(await readFile(META, 'utf8'));
const ids = JSON.parse(await readFile(IDS, 'utf8'));
const deny = JSON.parse(await readFile(DENYLIST, 'utf8'));
const deniedFiles = new Set(Object.keys(deny.files ?? {}));
const deniedStocks = new Set(Object.keys(deny.stocks ?? {}));
// Stocks whose item goes by a name unrelated to the stock's, checked by hand to be the same company.
const confirmed = new Set(Object.keys(deny.confirmed ?? {}));
const modeOverrides = existsSync(MODES) ? JSON.parse(await readFile(MODES, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const quoted = (values) => values.map((v) => JSON.stringify(v)).join(' ');
const qid = (uri) => uri.replace(/^.*\//, '');
const fileName = (url) => decodeURIComponent(url.replace(/^.*Special:FilePath\//, '')).replaceAll('_', ' ');

// Asks again after a refusal or a server error, waiting what the server asks (Retry-After) or longer each time.
async function politely(what, request) {
  for (let attempt = 0, wait = 30000; ; attempt++, wait = Math.min(wait * 2, 600000)) {
    let res;
    try {
      res = await request();
    } catch (err) {
      if (attempt >= 4) throw err;
      console.warn(`  ${what}: ${err.message}; waiting ${wait / 1000} s`);
      await sleep(wait);
      continue;
    }
    if (res.ok) return res;
    if ((res.status !== 429 && res.status < 500) || attempt >= 8) throw new Error(`${what} answered ${res.status}`);
    const asked = Number(res.headers.get('retry-after')) * 1000;
    const pause = Math.max(wait, Number.isFinite(asked) ? asked + 1000 : 0);
    console.warn(`  ${what} answered ${res.status}; waiting ${Math.round(pause / 1000)} s`);
    await sleep(pause);
  }
}

const started = Date.now();
const step = (text) => console.log(`[${Math.round((Date.now() - started) / 1000)} s] ${text}`);
async function sparql(query) {
  const res = await politely('Wikidata', () => fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(90000),
  }));
  await sleep(1000);
  return (await res.json()).results.bindings;
}

// Rows of `query(values)` for every chunk of `values`.
async function sparqlAll(values, size, query) {
  const rows = [];
  for (const part of chunks(values, size)) rows.push(...(await sparql(query(part))));
  return rows;
}
const itemValues = (items) => items.map((q) => `wd:${q}`).join(' ');

// Names reduced to their distinctive words: "Telia Lietuva, AB" → "telia lietuva".
const GENERIC = new Set(['inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'companies', 'the', 'group', 'grupe', 'grupa', 'holding', 'holdings',
  'plc', 'ltd', 'limited', 'ab', 'publ', 'oyj', 'abp', 'oy', 'asa', 'as', 'a/s', 'sa', 's.a', 'nv', 'n.v', 'se', 'ag', 'spa', 's.p.a', 'llc', 'lp', 'l.p',
  'class', 'a', 'b', 'c', 'ordinary', 'shares', 'common', 'stock', 'adr', 'ads', 'akcine', 'bendrove', 'ab.', 'grupp', 'aktiebolag', 'oyj.', '&', 'and', 'de']);
const allWords = (name) => (name ?? '').toLowerCase().replace(/[øœæßł]/g, (c) => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', ł: 'l' })[c])
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[,()/-]/g, ' ').split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
const words = (name) => allWords(name).filter((w) => !GENERIC.has(w));
const sameName = (a, b) => words(a).join(' ') !== '' && words(a).join(' ') === words(b).join(' ');
// Two names of one company: a distinctive word in common ("Bank of Åland", "Ålandsbanken"), one written together
// ("AkzoNobel"), or initials ("KKR", "Kohlberg Kravis Roberts"). An item matched by ISIN or ticker under a name
// unrelated to the stock's is a former company or a reused ticker ("Kojamo" for Lumo Kodit, "Life Time" for LATAM).
function related(a, b) {
  const [A, B] = [words(a), words(b)];
  if (A.length === 0 || B.length === 0) return false;
  const [ca, cb] = [A.join(''), B.join('')];
  if (A.some((w) => B.includes(w)) || A.some((w) => w.length >= 4 && cb.includes(w)) || B.some((w) => w.length >= 4 && ca.includes(w))) return true;
  const initials = (list) => list.filter((w) => !['of', 'and', 'the', 'de'].includes(w)).map((w) => w[0]).join('');
  const pairs = [[initials(allWords(a)), B[0]], [initials(A), B[0]], [initials(allWords(b)), A[0]], [initials(B), A[0]]];
  return pairs.some(([i, w]) => i.length >= 3 && w.startsWith(i));
}
// A national subsidiary under its parent's brand: the stock's name is the parent's plus a country ("Telia" + "Lietuva").
const COUNTRY_WORDS = new Set(['lietuva', 'lithuania', 'latvija', 'latvia', 'eesti', 'estonia', 'suomi', 'finland', 'sverige', 'sweden', 'norge', 'norway',
  'danmark', 'denmark', 'polska', 'poland', 'deutschland', 'germany', 'france', 'italia', 'italy', 'espana', 'spain', 'nederland', 'belgium', 'belgique',
  'osterreich', 'austria', 'schweiz', 'suisse', 'brasil', 'brazil', 'mexico', 'india', 'japan', 'china', 'uk', 'usa', 'baltic', 'baltics', 'nordic']);
const sameBrand = (parent, stock) => {
  const [p, s] = [words(parent), words(stock)];
  return p.length > 0 && s.length > p.length && p.every((w, i) => s[i] === w) && s.slice(p.length).every((w) => COUNTRY_WORDS.has(w));
};

// Wikidata items under which each exchange's listings are recorded (P414), as found on 14 Nov 2026: the exchange
// itself and the group or older names that listings still use.
const EXCHANGE_ITEMS = {
  XNAS: ['Q82059'], XNYS: ['Q13677'], XCSE: ['Q1019983', 'Q1132158'], XSTO: ['Q1019992', 'Q1132158'], XHEL: ['Q581755', 'Q1132158'],
  XTAL: ['Q1433248'], XRIS: ['Q1624698'], XLIT: ['Q600958'], XPAR: ['Q2385849', 'Q842108'], XAMS: ['Q478720', 'Q842108'],
  XMIL: ['Q936563', 'Q3642744', 'Q842108'],
};
// Country items and search languages of the exchanges' home countries.
const COUNTRY = { XNAS: ['Q30', 'en'], XNYS: ['Q30', 'en'], XCSE: ['Q35', 'da'], XSTO: ['Q34', 'sv'], XHEL: ['Q33', 'fi'], XTAL: ['Q191', 'et'],
  XRIS: ['Q211', 'lv'], XLIT: ['Q37', 'lt'], XPAR: ['Q142', 'fr'], XAMS: ['Q55', 'nl'], XMIL: ['Q38', 'it'] };

// Names and Wikipedia titles of the stocks, from the same lists the site shows.
const universe = (await runnerImport('./worker/universe.ts')).module;
const listed = new Map();
for (const market of ['us', 'nordic', 'euronext', 'baltic']) {
  const { items, failed } = await universe.marketData(market);
  if (failed.length) console.warn(`  ${market}: ${failed.join(', ')} could not be read; their stocks are matched without names`);
  for (const { inst } of items) listed.set(inst.symbol, inst);
}

const symbols = Object.keys(meta.stocks).filter((symbol) => ids[symbol] && !deniedStocks.has(symbol));
const nameOf = (symbol) => listed.get(symbol)?.name ?? '';
// Wikidata items per stock, strongest match first.
const matches = new Map(symbols.map((s) => [s, []]));
const addMatch = (symbol, item, how) => {
  const list = matches.get(symbol);
  if (!list.some((m) => m.item === item)) list.push({ item, how });
};

step('matching by ISIN');
// 1a. ISIN.
const bySin = new Map();
for (const row of await sparqlAll([...new Set(symbols.map((s) => ids[s].isin).filter(Boolean))], 400,
  (part) => `SELECT ?isin ?item WHERE { VALUES ?isin { ${quoted(part)} } ?item wdt:P946 ?isin }`)) {
  bySin.set(row.isin.value, [...(bySin.get(row.isin.value) ?? []), qid(row.item.value)]);
}
step('matching by ticker');
// 1b. Ticker on the stock's exchange.
const byTicker = new Map();
const exchangeValues = [...new Set(Object.values(EXCHANGE_ITEMS).flat())].map((q) => `wd:${q}`).join(' ');
for (const row of await sparqlAll([...new Set(symbols.map((s) => ids[s].ticker))], 400,
  (part) => `SELECT ?ticker ?ex ?item WHERE { VALUES ?ticker { ${quoted(part)} } ?item p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker .
    VALUES ?ex { ${exchangeValues} } ?st wikibase:rank ?rank FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?st pq:P582 ?end } }`)) {
  const key = `${qid(row.ex.value)}|${row.ticker.value}`;
  byTicker.set(key, [...(byTicker.get(key) ?? []), qid(row.item.value)]);
}
step('matching by Wikipedia article');
// 1c. English Wikipedia article of hand-checked stocks.
const byWiki = new Map();
for (const row of await sparqlAll([...new Set(symbols.map((s) => listed.get(s)?.wiki).filter(Boolean))], 200,
  (part) => `SELECT ?title ?item WHERE { VALUES ?title { ${part.map((t) => `${JSON.stringify(t)}@en`).join(' ')} }
    ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title }`)) {
  byWiki.set(row.title.value, qid(row.item.value));
}
for (const symbol of symbols) {
  const { isin, ticker, exchange } = ids[symbol];
  for (const item of (isin && bySin.get(isin)) ?? []) addMatch(symbol, item, 'isin');
  for (const ex of EXCHANGE_ITEMS[exchange] ?? []) for (const item of byTicker.get(`${ex}|${ticker}`) ?? []) addMatch(symbol, item, 'ticker');
  const wiki = listed.get(symbol)?.wiki;
  if (wiki && byWiki.has(wiki)) addMatch(symbol, byWiki.get(wiki), 'wiki');
}

step('matching by name');
// 1d. By name, for stocks still without an item: the search's hits whose label or alias is the same name and that
// are listed on the stock's exchange, carry its ticker, or are businesses of the exchange's country. One hit only.
const unmatched = symbols.filter((s) => matches.get(s).length === 0 && nameOf(s));
const searches = unmatched.flatMap((s) => [...new Set(['en', COUNTRY[ids[s].exchange]?.[1] ?? 'en'])].map((lang) => ({ s, lang, name: nameOf(s) })));
const hits = new Map();
// Small batches: the search service answers a long list of searches only in part.
for (const part of chunks(searches, 15)) {
  const rows = await sparql(`SELECT ?name ?lang ?item ?label WHERE {
    VALUES (?name ?lang) { ${part.map((q) => `(${JSON.stringify(q.name)} ${JSON.stringify(q.lang)})`).join(' ')} }
    SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch"; mwapi:search ?name; mwapi:language ?lang; mwapi:limit "7" .
      ?item wikibase:apiOutputItem mwapi:item . }
    { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label } }`);
  for (const row of rows) {
    if (!sameName(row.name.value, row.label.value)) continue;
    const key = row.name.value;
    hits.set(key, new Set([...(hits.get(key) ?? []), qid(row.item.value)]));
  }
}
const hitItems = [...new Set([...hits.values()].flatMap((set) => [...set]))];
const facts = new Map(hitItems.map((q) => [q, { exchanges: new Set(), tickers: new Set(), countries: new Set(), business: false }]));
// Tickers are kept with their exchange: "RTX" on the NYSE is not RTX A/S in Copenhagen.
for (const row of await sparqlAll(hitItems, 300, (part) => `SELECT ?item ?ex ?ticker WHERE { VALUES ?item { ${itemValues(part)} } ?item p:P414 ?st . ?st ps:P414 ?ex . OPTIONAL { ?st pq:P249 ?ticker } }`)) {
  facts.get(qid(row.item.value)).exchanges.add(qid(row.ex.value));
  if (row.ticker) facts.get(qid(row.item.value)).tickers.add(`${qid(row.ex.value)}|${row.ticker.value}`);
}
for (const row of await sparqlAll(hitItems, 300, (part) => `SELECT ?item ?country ?business WHERE { VALUES ?item { ${itemValues(part)} }
    OPTIONAL { ?item wdt:P17 ?country } BIND(EXISTS { ?item wdt:P31/wdt:P279? ?t VALUES ?t { wd:Q4830453 wd:Q6881511 wd:Q783794 wd:Q891723 wd:Q2401749 wd:Q1589009 } } AS ?business) }`)) {
  const f = facts.get(qid(row.item.value));
  if (row.country) f.countries.add(qid(row.country.value));
  if (row.business.value === 'true') f.business = true;
}
for (const symbol of unmatched) {
  const { ticker, exchange } = ids[symbol];
  const found = [...(hits.get(nameOf(symbol)) ?? [])].filter((q) => {
    const f = facts.get(q);
    // The same ticker on another exchange counts only for names long enough not to be shared ("RTX" is two companies).
    const sameTicker = [...f.tickers].some((t) => t.endsWith(`|${ticker}`)) && words(nameOf(symbol)).join('').length >= 4;
    return (EXCHANGE_ITEMS[exchange] ?? []).some((ex) => f.exchanges.has(ex)) || sameTicker || (f.business && f.countries.has(COUNTRY[exchange]?.[0]));
  });
  if (found.length === 1) addMatch(symbol, found[0], 'name');
}

// 2. Facts of the matched items and of their parents, brands and successors.
const items = new Map();
async function describe(qids) {
  const fresh = [...new Set(qids)].filter((q) => !items.has(q));
  for (const q of fresh) items.set(q, { label: '', dissolved: null, replacedBy: [], replaces: [], parents: [], brands: [], logos: [] });
  const one = async (prop, apply) => {
    for (const row of await sparqlAll(fresh, 300, (part) => `SELECT ?item ?v WHERE { VALUES ?item { ${itemValues(part)} } ?item wdt:${prop} ?v }`)) {
      apply(items.get(qid(row.item.value)), row.v.value);
    }
  };
  await one('P576', (it, v) => (it.dissolved = !it.dissolved || v < it.dissolved ? v.slice(0, 10) : it.dissolved));
  await one('P1366', (it, v) => it.replacedBy.push(qid(v)));
  await one('P1365', (it, v) => it.replaces.push(qid(v)));
  await one('P749', (it, v) => it.parents.push(qid(v)));
  await one('P127', (it, v) => it.parents.push(qid(v)));
  await one('P1716', (it, v) => it.brands.push(qid(v)));
  for (const row of await sparqlAll(fresh, 300, (part) => `SELECT ?item ?label WHERE { VALUES ?item { ${itemValues(part)} }
      OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") } OPTIONAL { ?item rdfs:label ?mul FILTER(lang(?mul) = "mul") }
      OPTIONAL { ?item rdfs:label ?any } BIND(COALESCE(?en, ?mul, ?any) AS ?label) }`)) {
    const it = items.get(qid(row.item.value));
    if (!it.label && row.label) it.label = row.label.value;
  }
  for (const row of await sparqlAll(fresh, 200, (part) => `SELECT ?item ?logo ?rank ?start ?end WHERE { VALUES ?item { ${itemValues(part)} }
      ?item p:P154 ?st . ?st ps:P154 ?logo ; wikibase:rank ?rank . OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }`)) {
    items.get(qid(row.item.value)).logos.push({
      file: fileName(row.logo.value), rank: row.rank.value.replace(/^.*#/, ''), start: row.start?.value.slice(0, 10) ?? null, end: row.end?.value.slice(0, 10) ?? null,
    });
  }
}
step('reading the items');
await describe([...matches.values()].flatMap((list) => list.map((m) => m.item)));
await describe([...items.values()].flatMap((it) => [...it.parents, ...it.brands, ...it.replacedBy]));

// A file name that dates the logo to a period that has ended ("Kroger logo (1961-2019)").
// Or one that calls itself old ("Johnson Controls old logo", "Orion logo (until 2025)").
const datedPast = (file) => [...file.matchAll(/\b(?:(?:1[89]\d\d|20\d\d)\s*[-–—]|until|bis)\s*(1[89]\d\d|20\d\d)\b/gi)].some((m) => Number(m[1]) < Number(TODAY.slice(0, 4)))
  || /\b(old|former|historic(al)?|vintage|retro|previous|obsolete)\b/i.test(file);

// The item's current logo files, best first.
function currentLogos(item) {
  let list = items.get(item).logos.filter((l) => l.rank !== 'DeprecatedRank' && !(l.end && l.end <= TODAY) && !datedPast(l.file));
  if (list.some((l) => l.rank === 'PreferredRank')) list = list.filter((l) => l.rank === 'PreferredRank');
  const latest = list.reduce((max, l) => (l.start && l.start > max ? l.start : max), '');
  if (latest) list = list.filter((l) => l.start === latest);
  // Vector files first.
  return [...new Set(list.map((l) => l.file))].sort((a, b) => Number(/\.svg$/i.test(b)) - Number(/\.svg$/i.test(a)));
}

const gone = (q) => {
  const it = items.get(q);
  return Boolean(it.dissolved && it.dissolved <= TODAY);
};

// Per stock: the logo files to try in order, each with how it was found.
const candidates = new Map();
for (const symbol of symbols) {
  const name = nameOf(symbol);
  let list = matches.get(symbol);
  // An item that another match replaces, or that names another match as its successor, is the former company.
  const matched = new Set(list.map((m) => m.item));
  const replaced = new Set([...list.flatMap((m) => items.get(m.item).replaces),
    ...list.filter((m) => items.get(m.item).replacedBy.some((q) => matched.has(q))).map((m) => m.item)]);
  list = list.filter((m) => !gone(m.item) && !replaced.has(m.item));
  // Two live items for one stock (a company and its subsidiary sharing an ISIN): the one named like the stock.
  if (name && list.length > 1 && list.some((m) => sameName(items.get(m.item).label, name))) list = list.filter((m) => sameName(items.get(m.item).label, name));
  // An item under an unrelated name is left out, unless that pair was checked by hand.
  if (name && !confirmed.has(symbol)) list = list.filter((m) => m.how === 'name' || related(items.get(m.item).label, name));
  const options = [];
  for (const m of list) for (const file of currentLogos(m.item)) options.push({ file, item: m.item, how: m.how });
  // The parent's or the brand's logo, only under the same name as the stock.
  for (const m of list) {
    const it = items.get(m.item);
    for (const other of [...it.brands, ...it.parents]) {
      if (!items.has(other) || gone(other) || !sameBrand(items.get(other).label, name || it.label)) continue;
      for (const file of currentLogos(other)) options.push({ file, item: other, how: `${m.how}, ${it.brands.includes(other) ? 'brand' : 'parent'}` });
    }
  }
  if (options.length) candidates.set(symbol, options.filter((o, i) => options.findIndex((p) => p.file === o.file) === i));
}
console.log(`Wikidata: ${[...matches.values()].filter((l) => l.length).length} of ${symbols.length} stocks matched, ${candidates.size} with a current logo file`);

// 3. Licence and format of every candidate file, 50 per call, answers cached for a week.
const cache = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
const WEEK = 7 * 24 * 3600 * 1000;
async function commons(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  const params = {
    action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo|templates', iiprop: 'extmetadata|size|mime|url|sha1',
    iiextmetadatafilter: 'LicenseShortName|Artist|Restrictions', tltemplates: [...Object.keys(TAGS), ...US_ONLY].map((t) => `Template:${t}`).join('|'), tllimit: 'max',
    titles: titles.join('|'),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await politely('Commons', () => fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }));
  await sleep(3000);
  return res.json();
}
const files = [...new Set([...candidates.values()].flat().map((o) => o.file))].filter((f) => /\.svg$/i.test(f) && !deniedFiles.has(f));
const unknown = files.filter((f) => !(cache[f] && Date.now() - cache[f].at < WEEK));
console.log(`Commons: ${files.length} SVG files to check, ${unknown.length} not checked this week`);
for (const part of chunks(unknown, 50)) {
  const json = await commons(part.map((f) => `File:${f}`));
  const original = new Map((json.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of json.query.pages) {
    const file = (original.get(page.title) ?? page.title).replace(/^File:/, '');
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    cache[file] = {
      at: Date.now(), missing: !info, licence: meta.LicenseShortName?.value ?? null,
      usOnly: (page.templates ?? []).some((t) => US_ONLY.includes(t.title.replace(/^Template:/, ''))),
      tags: [...new Set((page.templates ?? []).map((t) => TAGS[t.title.replace(/^Template:/, '')]).filter(Boolean))],
      artist: (meta.Artist?.value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || null,
      mime: info?.mime, size: info?.size, url: info?.url, page: info?.descriptionurl, sha1: info?.sha1,
    };
  }
  await writeFile(CACHE, JSON.stringify(cache));
}
const accepted = new Map();
const refused = new Map();
for (const file of files) {
  const c = cache[file];
  const why = c.missing ? 'missing' : !['Public domain', 'CC0'].includes(c.licence) ? `licence ${c.licence}` : c.tags.length === 0 ? 'no accepted copyright tag' : c.usOnly ? 'public domain in the US only'
    : c.mime !== 'image/svg+xml' ? c.mime : c.size > MAX_BYTES ? `${Math.round(c.size / 1024)} KB` : null;
  if (why) refused.set(file, why);
  else accepted.set(file, { id: c.sha1.slice(0, 8), url: c.url, page: c.page, licence: `${c.licence === 'CC0' ? 'CC0' : 'Public domain'} (${c.tags.join(', ')})`, artist: c.artist });
}
console.log(`Commons: ${accepted.size} of ${files.length} files are free logos in SVG`);

// 4. Download, clean, crop and measure each file.
function sanitise(svg) {
  // Illustrator files name their namespaces in the DOCTYPE ("&ns_svg;"), so those names are written out first.
  const entities = new Map([...svg.matchAll(/<!ENTITY\s+([\w.-]+)\s+"([^"<>]*)"\s*>/g)].map((m) => [m[1], m[2]]));
  let out = svg
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '')
    .replace(/&([\w.-]+);/g, (ref, name) => entities.get(name) ?? ref)
    .replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->/gi, '')
    .replace(/<(script|foreignObject|metadata)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|metadata)\b[^>]*\/>/gi, '')
    .replace(/\s(sodipodi|inkscape):[\w-]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .trim();
  // Editor elements nest (a namedview holds grids), so the innermost go first.
  for (let before = ''; before !== out;) {
    before = out;
    out = out.replace(/<((?:sodipodi|inkscape):[\w-]+)\b[^>]*\/>/gi, '').replace(/<((?:sodipodi|inkscape):[\w-]+)\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1\s*>/gi, '');
  }
  // Raster pictures make a blurred logo; such files are left out.
  if (/<image\b/i.test(out)) return null;
  const root = out.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return null;
  if (!/viewBox=/i.test(root)) {
    const size = (name) => Number(root.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i'))?.[1]);
    const [w, h] = [size('width'), size('height')];
    if (!(w > 0 && h > 0)) return null;
    out = out.replace(root, root.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`));
  }
  return out;
}

// The root's viewBox, and the root rewritten to `box` with matching width and height.
const viewBox = (svg) => svg.match(/<svg\b[^>]*\sviewBox\s*=\s*["']([^"']*)["']/i)?.[1].trim().split(/[\s,]+/).map(Number);
const round = (n) => Math.round(n * 100) / 100;
const withBox = (svg, [x, y, w, h]) => svg.replace(/<svg\b[^>]*>/i, (root) => root
  .replace(/\s(width|height|x|y|preserveAspectRatio|viewBox)\s*=\s*("[^"]*"|'[^']*')/gi, '')
  .replace(/^<([\w:]+)/, `<$1 viewBox="${round(x)} ${round(y)} ${round(w)} ${round(h)}" width="${round(w)}" height="${round(h)}"`));

// Letters set in a font look different on every visitor's machine; logos are taken only with their letters drawn.
const setInFont = (svg) => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text\s*>/gi)].some((m) => m[1].replace(/<[^>]*>/g, '').trim() !== '');

// What a browser shows of the file: the viewBox widened (or narrowed) to the width and height it declares.
function visibleBox(svg) {
  const box = viewBox(svg);
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || !(box[2] > 0 && box[3] > 0)) return null;
  const root = svg.match(/<svg\b[^>]*>/i)[0];
  const size = (name) => Number(root.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px|pt|mm|cm|in)?\\s*["']`, 'i'))?.[1]);
  const [W, H] = [size('width'), size('height')];
  const ratio = root.match(/\spreserveAspectRatio\s*=\s*["']([^"']*)["']/i)?.[1] ?? 'xMidYMid meet';
  if (!(W > 0 && H > 0) || /none/.test(ratio)) return box;
  const scale = (/slice/.test(ratio) ? Math.max : Math.min)(W / box[2], H / box[3]);
  const [vw, vh] = [W / scale, H / scale];
  const align = (axis) => (ratio.includes(`${axis}Min`) ? 0 : ratio.includes(`${axis}Max`) ? 1 : 0.5);
  return [box[0] + (box[2] - vw) * align('x'), box[1] + (box[3] - vh) * align('Y'), vw, vh];
}

await mkdir(LOGOS, { recursive: true });
const present = new Set((await readdir(LOGOS)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));

async function download(url) {
  const res = await politely('upload.wikimedia.org', () => fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }));
  return res.text();
}
for (const [file, logo] of accepted) {
  if (present.has(logo.id)) continue;
  try {
    const svg = sanitise(await download(logo.url));
    if (!svg) throw new Error('not a usable SVG');
    await writeFile(join(LOGOS, `${logo.id}.svg`), `${svg}\n`);
    present.add(logo.id);
  } catch (err) {
    console.warn(`  ${file}: ${err.message}`);
    refused.set(file, err.message);
    accepted.delete(file);
  } finally {
    await sleep(2000);
  }
}

// Draws every logo in a browser: the box around what it paints (so wide and square logos are sized alike), and
// whether it paints light lettering on a coloured shape, which a one-colour mask would fill in.
let chromium = null;
try {
  chromium = createRequire(import.meta.url)('playwright').chromium;
} catch {
  console.warn('Playwright is not installed: logos keep their own margins and are shown as masks unless logo-modes.json says otherwise.');
}
// Draws an SVG (framed to `frame`) on a canvas in the page: what it paints in the middle half of the frame.
const measure = async ({ svg, frame }) => {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  try { await img.decode(); } catch { return null; }
  const scale = 1600 / Math.max(frame[2], frame[3]);
  const [w, h] = [Math.ceil(frame[2] * scale), Math.ceil(frame[3] * scale)];
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  // The shown part is the middle half of the frame in each direction.
  const [sx0, sy0, sx1, sy1] = [Math.floor(w / 4), Math.floor(h / 4), Math.ceil((w * 3) / 4), Math.ceil((h * 3) / 4)];
  let [x0, y0, x1, y1, outside, solid, light, sum] = [w, h, -1, -1, 0, 0, 0, 0];
  const lum = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 32) continue;
    if (x < sx0 || x >= sx1 || y < sy0 || y >= sy1) { outside++; continue; }
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    sum += data[i] + data[i + 1] + data[i + 2] + data[i + 3];
    if (data[i + 3] < 200) continue;
    solid++;
    if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) light++;
    if (solid % 7 === 0) lum.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
  }
  if (x1 < 0) return null;
  // How much of its box the drawing fills, and how much of it stands apart from its main colour.
  lum.sort((a, b) => a - b);
  const median = lum[Math.floor(lum.length / 2)] ?? 0;
  const contrast = lum.length ? lum.filter((l) => Math.abs(l - median) > 0.3).length / lum.length : 0;
  const fill = solid / ((x1 + 1 - x0) * (y1 + 1 - y0));
  const edge = 2;
  const touches = x0 - sx0 < edge || y0 - sy0 < edge || sx1 - 1 - x1 < edge || sy1 - 1 - y1 < edge;
  return {
    box: [(x0 - sx0) / scale, (y0 - sy0) / scale, (x1 + 1 - x0) / scale, (y1 + 1 - y0) / scale],
    light: solid ? light / solid : 0, fill, contrast, solid, sum, cut: touches && outside > 0.01 * solid,
  };
};
const measured = new Map();
if (chromium) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, { id }] of accepted) {
    if (measured.has(id)) continue;
    const path = join(LOGOS, `${id}.svg`);
    let original = (await readFile(path, 'utf8')).trim();
    const shown = visibleBox(original);
    if (!shown) {
      console.warn(`  ${file}: no usable size`);
      refused.set(file, 'no size');
      accepted.delete(file);
      continue;
    }
    // Drawn in a frame twice as large, to see whether the drawing runs past the edges of what is shown.
    const frame = [shown[0] - shown[2] / 2, shown[1] - shown[3] / 2, shown[2] * 2, shown[3] * 2];
    const draw = (svg) => page.evaluate(measure, { svg: withBox(svg, frame), frame });
    let result = await draw(original);
    // Text set in a font: kept only when it does not show (a note left outside the drawing), and then removed.
    if (result && setInFont(original)) {
      const bare = original.replace(/<text\b[\s\S]*?<\/text\s*>/gi, '');
      const without = await draw(bare);
      if (!without || Math.abs(without.solid - result.solid) > 0.002 * result.solid || Math.abs(without.sum - result.sum) > 0.002 * result.sum) {
        console.warn(`  ${file}: letters set in a font`);
        refused.set(file, 'letters set in a font');
        accepted.delete(file);
        continue;
      }
      [original, result] = [bare, without];
    }
    // Nothing drawn, or a drawing cut off at the edge of what the file shows: left out.
    if (!result || result.cut) {
      console.warn(`  ${file}: ${result ? 'drawing runs past the edge of the file' : 'draws nothing'}`);
      refused.set(file, result ? 'cut off' : 'empty');
      accepted.delete(file);
      continue;
    }
    const [x, y, w, h] = result.box;
    const pad = Math.max(w, h) * 0.02;
    const cropped = [shown[0] + x - pad, shown[1] + y - pad, w + 2 * pad, h + 2 * pad];
    await writeFile(path, `${withBox(original, cropped)}\n`);
    // A one-colour mask keeps only the outline of what is drawn: fine for lettering and marks of one colour, but
    // light lettering on a coloured shape, or a filled shape with lettering of another colour, becomes a blot.
    const badge = (result.light > 0.04 && result.light < 0.9) || (result.fill > 0.45 && result.contrast > 0.04);
    measured.set(id, { ratio: round(cropped[2] / cropped[3]), badge });
  }
  await browser.close();
}
const ratioOf = async (id) => {
  if (measured.has(id)) return measured.get(id).ratio;
  const box = viewBox(await readFile(join(LOGOS, `${id}.svg`), 'utf8'));
  return box ? round(box[2] / box[3]) : 3;
};

// 5. Credits, the logo fields of the heatmap data, and no files left that nothing uses.
const chosen = new Map();
for (const [symbol, options] of candidates) {
  const option = options.find((o) => accepted.has(o.file) && present.has(accepted.get(o.file).id));
  if (option) chosen.set(symbol, option);
}
const usedFiles = new Map();
for (const { file } of chosen.values()) usedFiles.set(file, accepted.get(file));
const modeOf = (file, id) => modeOverrides[file] ?? (measured.get(id)?.badge ? 'badge' : 'mask');
const credits = [...usedFiles].map(([file, { id, page, licence, artist }]) => ({ id, file, page, licence, ...(artist ? { author: artist } : {}), mode: modeOf(file, id) }))
  .sort((a, b) => a.id.localeCompare(b.id))
  .filter((c, i, all) => all.findIndex((d) => d.id === c.id) === i);
await writeFile(join(LOGOS, 'credits.json'), `[\n${credits.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
const used = new Set(credits.map((c) => c.id));
for (const id of present) if (!used.has(id)) await unlink(join(LOGOS, `${id}.svg`));

const creditOf = new Map(credits.map((c) => [c.id, c]));
for (const [symbol, entry] of Object.entries(meta.stocks)) {
  delete entry.logo;
  delete entry.logoRatio;
  delete entry.logoMode;
  const option = chosen.get(symbol);
  if (!option) continue;
  const { id } = accepted.get(option.file);
  entry.logo = id;
  entry.logoRatio = await ratioOf(id);
  if (creditOf.get(id).mode === 'badge') entry.logoMode = 'badge';
}
const lines = Object.keys(meta.stocks).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(meta.stocks[key])}`).join(',\n');
await writeFile(META, `{"built":${JSON.stringify(meta.built)},"sharesAsOf":${JSON.stringify(meta.sharesAsOf)},"stocks":{\n${lines}\n}}\n`);
console.log(`${used.size} logo files (${credits.filter((c) => c.mode === 'badge').length} as badges); ${chosen.size} stocks have a logo`);

// 6. Contact sheet for review: each stock with its logo as a mask on light and dark tiles and as drawn, the item it
// came from and how it was matched. Names that differ from the item's label are marked for a closer look.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = await Promise.all([...chosen].sort(([a], [b]) => a.localeCompare(b)).map(async ([symbol, option]) => {
  const { id } = accepted.get(option.file);
  const data = `data:image/svg+xml;base64,${(await readFile(join(LOGOS, `${id}.svg`))).toString('base64')}`;
  const { mode } = creditOf.get(id);
  const it = items.get(option.item);
  const flag = !sameName(it.label, nameOf(symbol)) || option.how !== 'isin' && option.how !== 'ticker' && option.how !== 'wiki';
  return `<figure class="${flag ? 'flag' : ''}"><div><i class="l ${mode}" style="--l:url('${data}');--r:${meta.stocks[symbol].logoRatio}"></i><i class="d ${mode}" style="--l:url('${data}');--r:${meta.stocks[symbol].logoRatio}"></i><img src="${data}" alt=""></div>
<figcaption><b>${esc(symbol)}</b> ${esc(nameOf(symbol))}<br>${esc(option.item)} ${esc(it.label)} · ${esc(option.how)} · ${mode}<br><small>${esc(option.file)}</small></figcaption></figure>`;
}));
await writeFile(SHEET, `<!doctype html><meta charset="utf-8"><style>
body{font:11px system-ui;margin:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
figure{margin:0;padding:4px;border:1px solid #ddd}figure.flag{border-color:#e08000;background:#fff6e8}
div{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;align-items:center}
i{display:flex;align-items:center;justify-content:center;height:44px}i.l{background:#9fd3b8;color:#0e1014}i.d{background:#a23a33;color:#fff}
i::before{content:"";display:block;height:calc(20px * clamp(.6, sqrt(2.6 / var(--r)), 1.5));aspect-ratio:var(--r);max-width:90%;background:currentColor;-webkit-mask:var(--l) center/contain no-repeat;mask:var(--l) center/contain no-repeat}
i.badge::before{box-sizing:content-box;padding:2px 4px;border-radius:3px;background:#fff var(--l) center/contain no-repeat;background-origin:content-box;-webkit-mask:none;mask:none}
img{max-width:100%;max-height:44px;justify-self:center;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/10px 10px}
figcaption{margin-top:3px;overflow:hidden;text-overflow:ellipsis}small{color:#777}</style>${rows.join('\n')}`);
console.log(`Contact sheet: ${SHEET}`);

// Files refused, for the record.
await writeFile(join(tmpdir(), 'heatmap-logos-refused.json'), JSON.stringify(Object.fromEntries(refused), null, 1));
