// Finds public-domain text logos for the heatmap's stocks and serves them from the site itself:
// Wikidata's logo (P154) of each company, kept only when Wikimedia Commons marks the file public domain
// and files it under "PD textlogo", as an SVG of at most 48 KB. Each file is cleaned of scripts and outside links
// and saved as public/logos/<first 8 hex of its sha1>.svg; public/logos/credits.json lists the sources.
//
// Run by hand about quarterly, after npm run heatmap:data (which writes scripts/heatmap/ids.json), and commit
// the result. Never in CI: Wikimedia rate-limits, so calls are paced. Files already downloaded are skipped.
// After a run, review the contact sheet it writes (outside the repo) and add bad files to scripts/heatmap/logo-denylist.json.
//
//   node scripts/heatmap-logos.mjs [contact-sheet.html]
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runnerImport } from 'vite';

const META = 'public/data/heatmap.json';
const IDS = 'scripts/heatmap/ids.json';
const DENYLIST = 'scripts/heatmap/logo-denylist.json';
const LOGOS = 'public/logos';
const SHEET = process.argv[2] ?? join(tmpdir(), 'logo-sheet.html');
const { brand } = (await runnerImport('./src/config/brand.ts')).module;
const USER_AGENT = `stocks-viewer/1.0 (+${brand.siteUrl.replace(/^https?:\/\//, '')})`;
const MAX_BYTES = 48 * 1024;

const meta = JSON.parse(await readFile(META, 'utf8'));
const ids = JSON.parse(await readFile(IDS, 'utf8'));
const denylist = new Set(JSON.parse(await readFile(DENYLIST, 'utf8')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  return (await res.json()).results.bindings;
}

const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const fileName = (url) => decodeURIComponent(url.replace(/^.*Special:FilePath\//, '')).replaceAll('_', ' ');
const quoted = (values) => values.map((v) => JSON.stringify(v)).join(' ');

// Wikidata items of the exchanges, as listed on 14 Nov 2026; the rest are looked up by name.
const EXCHANGE_ITEMS = { XNAS: 'Q82059', XNYS: 'Q13677', XCSE: 'Q1019983', XSTO: 'Q1019992', XHEL: 'Q581755', XTAL: 'Q1433248', XRIS: 'Q1624698', XPAR: 'Q2385849' };
const EXCHANGE_NAMES = { XLIT: 'Nasdaq Vilnius', XAMS: 'Euronext Amsterdam', XMIL: 'Borsa Italiana' };
for (const [exchange, name] of Object.entries(EXCHANGE_NAMES)) {
  const [hit] = await sparql(`SELECT ?ex WHERE { ?ex rdfs:label ${JSON.stringify(name)}@en } LIMIT 1`);
  if (hit) EXCHANGE_ITEMS[exchange] = hit.ex.value.replace(/^.*\//, '');
}

// 1. Logo files per ISIN, then per ticker on its exchange.
const symbols = Object.keys(meta.stocks).filter((symbol) => ids[symbol]);
const byIsin = new Map();
const byTicker = new Map();
const add = (map, key, file) => map.set(key, [...(map.get(key) ?? []), file]);
const isins = [...new Set(symbols.map((s) => ids[s].isin).filter(Boolean))];
for (const part of chunks(isins, 400)) {
  for (const row of await sparql(`SELECT ?isin ?logo WHERE { VALUES ?isin { ${quoted(part)} } ?item wdt:P946 ?isin . ?item wdt:P154 ?logo }`)) {
    add(byIsin, row.isin.value, fileName(row.logo.value));
  }
}
const tickers = [...new Set(symbols.map((s) => ids[s].ticker))];
const exchangeValues = Object.values(EXCHANGE_ITEMS).map((q) => `wd:${q}`).join(' ');
for (const part of chunks(tickers, 400)) {
  const rows = await sparql(`SELECT ?ticker ?ex ?logo WHERE { VALUES ?ticker { ${quoted(part)} } ?item p:P414 ?st . ?st ps:P414 ?ex ; pq:P249 ?ticker .
    VALUES ?ex { ${exchangeValues} } ?item wdt:P154 ?logo }`);
  for (const row of rows) add(byTicker, `${row.ex.value.replace(/^.*\//, '')}|${row.ticker.value}`, fileName(row.logo.value));
}
const candidates = new Map();
for (const symbol of symbols) {
  const { isin, ticker, exchange } = ids[symbol];
  const files = [...new Set((isin && byIsin.get(isin)) || byTicker.get(`${EXCHANGE_ITEMS[exchange]}|${ticker}`) || [])];
  if (files.length > 0) candidates.set(symbol, files.sort((a, b) => Number(b.endsWith('.svg')) - Number(a.endsWith('.svg'))));
}
console.log(`Wikidata: ${candidates.size} of ${symbols.length} stocks have a logo file`);

// 2. Licence and format of every candidate file, 50 per call.
async function commons(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  const params = {
    action: 'query', format: 'json', prop: 'imageinfo|categories', iiprop: 'extmetadata|size|mime|url|sha1',
    iiextmetadatafilter: 'LicenseShortName|Restrictions', clcategories: 'Category:PD textlogo', cllimit: 'max', titles: titles.join('|'),
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  for (;;) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return res.json();
    console.warn(`  Commons answered ${res.status}; waiting 30 s`);
    await sleep(30000);
  }
}

const files = [...new Set([...candidates.values()].flat())];
const accepted = new Map();
for (const part of chunks(files, 50)) {
  const json = await commons(part.map((f) => `File:${f}`));
  const original = new Map((json.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of Object.values(json.query.pages)) {
    const info = page.imageinfo?.[0];
    const file = (original.get(page.title) ?? page.title).replace(/^File:/, '');
    const licence = info?.extmetadata?.LicenseShortName?.value;
    const ok = ['Public domain', 'CC0'].includes(licence) && (page.categories ?? []).length > 0
      && info.mime === 'image/svg+xml' && info.size <= MAX_BYTES && !denylist.has(file) && !denylist.has(page.title.replace(/^File:/, ''));
    if (ok) accepted.set(file, { id: info.sha1.slice(0, 8), url: info.url, page: info.descriptionurl, licence });
  }
  await sleep(2000);
}
console.log(`Commons: ${accepted.size} of ${files.length} files are public-domain text logos in SVG`);

// 3. Download and clean each file once.
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

await mkdir(LOGOS, { recursive: true });
const present = new Set((await readdir(LOGOS)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));
const saved = new Map();

// Downloads are paced, and a refusal for going too fast waits longer each time before asking again.
async function download(url) {
  for (let wait = 30000; ; wait *= 2) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (res.status !== 429 || wait > 240000) {
      if (!res.ok) throw new Error(`answered ${res.status}`);
      return res.text();
    }
    console.warn(`  upload.wikimedia.org answered 429; waiting ${wait / 1000} s`);
    await sleep(wait);
  }
}

for (const [file, logo] of accepted) {
  if (!present.has(logo.id)) {
    try {
      const svg = sanitise(await download(logo.url));
      if (!svg) throw new Error('not a usable SVG');
      await writeFile(join(LOGOS, `${logo.id}.svg`), `${svg}\n`);
      present.add(logo.id);
    } catch (err) {
      console.warn(`  ${file}: ${err.message}`);
      continue;
    } finally {
      await sleep(1500);
    }
  }
  saved.set(file, logo);
}

// 4. Credits, the logo ids in the heatmap data, and no files left that nothing uses.
const credits = [...saved].map(([file, { id, page, licence }]) => ({ id, file, page, licence })).sort((a, b) => a.id.localeCompare(b.id));
const uniqueCredits = credits.filter((c, i) => credits.findIndex((d) => d.id === c.id) === i);
await writeFile(join(LOGOS, 'credits.json'), `[\n${uniqueCredits.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
const used = new Set(uniqueCredits.map((c) => c.id));
for (const id of present) if (!used.has(id)) await unlink(join(LOGOS, `${id}.svg`));

let withLogo = 0;
for (const [symbol, entry] of Object.entries(meta.stocks)) {
  const file = candidates.get(symbol)?.find((f) => saved.has(f));
  if (file) {
    entry.logo = saved.get(file).id;
    withLogo++;
  } else {
    delete entry.logo;
  }
}
const lines = Object.keys(meta.stocks).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(meta.stocks[key])}`).join(',\n');
await writeFile(META, `{"built":${JSON.stringify(meta.built)},"sharesAsOf":${JSON.stringify(meta.sharesAsOf)},"stocks":{\n${lines}\n}}\n`);
console.log(`${used.size} logo files; ${withLogo} stocks have a logo`);

// 5. Contact sheet for review: every logo as a mask on the strongest and a middle tile colour of each palette.
const swatches = ['#73AE91', '#CB3931', '#347D56', '#E7584E', '#73A0D5', '#B75017', '#4A729D', '#E7833F'];
const inks = ['#0E1014', '#FFFFFF', '#F5F6F8', '#000000', '#0E1014', '#FFFFFF', '#F5F6F8', '#000000'];
const cells = await Promise.all(uniqueCredits.map(async ({ id, file }) => {
  const data = `data:image/svg+xml;base64,${(await readFile(join(LOGOS, `${id}.svg`))).toString('base64')}`;
  const tiles = swatches.map((bg, i) => `<i style="background:${bg};color:${inks[i]}"><b style="--l:url('${data}')"></b></i>`).join('');
  return `<figure><div>${tiles}</div><figcaption>${id} ${file.replace(/</g, '&lt;')}</figcaption></figure>`;
}));
await writeFile(SHEET, `<!doctype html><meta charset="utf-8"><style>
body{font:11px system-ui;margin:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px}
figure{margin:0}div{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}
i{display:block;height:34px;padding:4px}b{display:block;height:100%;background:currentColor;-webkit-mask:var(--l) center/contain no-repeat;mask:var(--l) center/contain no-repeat}
figcaption{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>${cells.join('\n')}`);
console.log(`Contact sheet: ${SHEET}`);
