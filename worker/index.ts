import { INDICES, STOCKS, toListing } from '../shared/catalog';
import { EXCHANGES, MARKET_EXCHANGES, MARKETS, sessionState } from '../shared/exchanges';
import type { Instrument, Market, ProviderStatus, Range } from '../shared/types';
import { edgeCache, LIVE_GRACE, takeBackgroundWork } from './http';
import { fundEntries, toFundRow } from './funds';
import { detail, history, PROVIDERS, summary, upcoming } from './market';
import { fxRates } from './providers/ecb';
import { balticNews } from './providers/news';
import { about } from './providers/wikipedia';
import { marketData, resolveSymbol } from './universe';

const RANGES: Range[] = ['1D', '5D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];
// Keeps one request comfortably under the Workers free-plan limit of 50 subrequests.
const MAX_SYMBOLS = 8;
// Up to this many, their candles also go through the edge cache, which takes two more subrequests each.
const MAX_EDGE_SYMBOLS = 4;
const DAY = 24 * 3600;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// `grace`: how long after max-age the edge cache may still serve the answer while it loads a new one.
function json(body: unknown, status = 200, maxAge = 0, grace = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}${grace > 0 ? `, stale-while-revalidate=${grace}` : ''}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function instrumentParam(url: URL): Promise<Instrument> {
  const inst = await resolveSymbol(url.searchParams.get('symbol') ?? '');
  if (!inst) throw new HttpError(404, 'Unknown symbol');
  return inst;
}

function marketParam(url: URL): Market {
  const market = url.searchParams.get('market') as Market;
  if (!MARKETS.includes(market)) throw new HttpError(400, 'Unknown market');
  return market;
}

// Prices move only while one of the market's exchanges is in session (or just closed).
function quotesMaxAge(market: Market): number {
  const now = new Date();
  const soon = new Date(now.getTime() - 15 * 60000);
  const trading = MARKET_EXCHANGES[market].some((id) => sessionState(EXCHANGES[id], now).isOpen || sessionState(EXCHANGES[id], soon).isOpen);
  return trading ? 60 : 600;
}

async function quotes(market: Market): Promise<Response> {
  const { items, failed } = await marketData(market);
  const body = { items: items.flatMap((item) => (item.quote ? [item.quote] : [])), failed };
  return failed.length ? json(body, 200, 30) : json(body, 200, quotesMaxAge(market), LIVE_GRACE);
}

async function universe(market: Market): Promise<Response> {
  const { items, failed } = await marketData(market);
  const body = { items: items.map((item) => toListing(item.inst)), failed };
  return failed.length ? json(body, 200, 60) : json(body, 200, DAY, 7 * DAY);
}

// The browser takes live prices from /api/quotes; stock summaries add slower figures and may be a few minutes old.
async function summaries(instruments: Instrument[], maxAge: number) {
  const edge = instruments.length <= MAX_EDGE_SYMBOLS;
  const results = await Promise.allSettled(instruments.map((inst) => summary(inst, edge)));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = instruments.filter((_, i) => results[i].status === 'rejected').map((i) => i.symbol);
  return failed.length ? json({ items, failed }) : json({ items, failed }, 200, maxAge, LIVE_GRACE);
}

// Every fund with its latest NAV. NAVs are published once a day.
async function funds(): Promise<Response> {
  const { items, failed } = await fundEntries();
  const body = { items: items.map(toFundRow), failed };
  return failed.length ? json(body, 200, 300) : json(body, 200, 3600, DAY);
}

async function status(): Promise<Response> {
  const probes: Record<string, Instrument> = {
    nasdaq: STOCKS.find((s) => s.provider === 'nasdaq')!,
    nordic: STOCKS.find((s) => s.provider === 'nordic')!,
    euronext: STOCKS.find((s) => s.provider === 'euronext')!,
    baltic: STOCKS.find((s) => s.provider === 'baltic')!,
  };
  const timed = async (provider: ProviderStatus['provider'], run: () => Promise<unknown>): Promise<ProviderStatus> => {
    const started = Date.now();
    try {
      await run();
      return { provider, ok: true, ms: Date.now() - started };
    } catch (err) {
      return { provider, ok: false, ms: Date.now() - started, error: String((err as Error).message) };
    }
  };
  const checks = Object.entries(probes).map(([id, inst]) =>
    timed(id as ProviderStatus['provider'], () => PROVIDERS[inst.provider].daily(inst, 0.1)),
  );
  checks.push(timed('ecb', fxRates));
  checks.push(...(['pensionikeskus'] as const).map((id) =>
    timed(id, async () => {
      if (!(await fundEntries()).items.some((e) => e.inst.provider === id)) throw new Error('No funds listed');
    })));
  return json({ checkedAt: new Date().toISOString(), providers: await Promise.all(checks) });
}

async function route(url: URL): Promise<Response> {
  switch (url.pathname) {
    case '/api/stocks': {
      const requested = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
      if (requested.length === 0 || requested.length > MAX_SYMBOLS) {
        throw new HttpError(400, `Pass 1 to ${MAX_SYMBOLS} symbols`);
      }
      const instruments = await Promise.all(requested.map(resolveSymbol));
      if (instruments.some((i) => !i)) throw new HttpError(404, 'Unknown symbol');
      return summaries(instruments as Instrument[], 300);
    }
    case '/api/indices':
      return summaries(INDICES, 60);
    case '/api/universe':
      return universe(marketParam(url));
    case '/api/quotes':
      return quotes(marketParam(url));
    case '/api/history': {
      const range = url.searchParams.get('range') as Range;
      if (!RANGES.includes(range)) throw new HttpError(400, 'Unknown range');
      const inst = await instrumentParam(url);
      const data = await history(inst, range);
      const fund = inst.kind === 'fund';
      if (!data) return json({ unavailable: true }, 200, fund ? 3600 : 300);
      // Past days do not change; the chart takes the latest price from the quote. Fund NAVs come once a day.
      if (fund) return json(data, 200, 3 * 3600, DAY);
      return range === '1D' ? json(data, 200, 120, LIVE_GRACE) : json(data, 200, 900, 3600);
    }
    case '/api/detail': {
      const inst = await instrumentParam(url);
      return inst.kind === 'fund' ? json(await detail(inst), 200, 3600, DAY) : json(await detail(inst), 200, 60, LIVE_GRACE);
    }
    case '/api/funds':
      return funds();
    case '/api/upcoming':
      return json(await upcoming(await instrumentParam(url)), 200, 6 * 3600, DAY);
    case '/api/fx':
      return json(await fxRates(), 200, 3600, 2 * DAY);
    case '/api/news':
      return json(await balticNews(url.searchParams.get('lang') === 'lt' ? 'lt' : 'en'), 200, 300, 900);
    case '/api/about': {
      const lang = url.searchParams.get('lang') === 'lt' ? 'lt' : 'en';
      const inst = await instrumentParam(url);
      // Funds have no encyclopedia article of their own.
      const data = inst.kind === 'fund' ? null : await about(inst, lang);
      if (!data) return json({ unavailable: true }, 200, DAY, 7 * DAY);
      // An English fallback for a Lithuanian reader is kept for an hour only, in case the Lithuanian fetch merely failed.
      return json(data, 200, data.lang === lang ? DAY : 3600, 7 * DAY);
    }
    case '/api/status':
      return status();
    default:
      throw new HttpError(404, 'Not found');
  }
}

async function respond(request: Request): Promise<Response> {
  try {
    return await route(new URL(request.url));
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'The market data source did not respond. Try again shortly.' }, 502);
  }
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

// Answers the request and keeps a public answer in the edge cache: fresh for its max-age, then served stale
// for its stale-while-revalidate time while a new one loads. The browser sees the max-age alone.
async function answer(request: Request, ctx?: Context): Promise<Response> {
  const response = await respond(request);
  const work = takeBackgroundWork();
  const edge = edgeCache();
  const [, maxAge, grace = '0'] = response.headers.get('Cache-Control')!.match(/^public, max-age=(\d+)(?:, stale-while-revalidate=(\d+))?/) ?? [];
  if (maxAge) {
    const kept = edge && response.clone();
    response.headers.set('Cache-Control', `public, max-age=${maxAge}`);
    if (kept) {
      kept.headers.set('Cache-Control', `public, max-age=${Number(maxAge) + Number(grace)}`);
      kept.headers.set('Expires', new Date(Date.now() + Number(maxAge) * 1000).toUTCString());
      work.push(edge.put(request, kept));
    }
  }
  if (ctx) ctx.waitUntil(Promise.all(work));
  else await Promise.all(work);
  return response;
}

// URLs whose stale edge copy this isolate is already replacing.
const revalidating = new Set<string>();

export default {
  async fetch(request: Request, _env?: unknown, ctx?: Context): Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'Read-only API' }, 405);
    const cached = await edgeCache()?.match(request);
    if (!cached) return answer(request, ctx);
    const freshFor = Math.floor((Date.parse(cached.headers.get('Expires') ?? '') - Date.now()) / 1000) || 0;
    if (freshFor <= 0 && ctx && !revalidating.has(request.url)) {
      revalidating.add(request.url);
      ctx.waitUntil(answer(request, ctx).finally(() => revalidating.delete(request.url)));
    }
    const response = new Response(cached.body, cached);
    response.headers.set('Cache-Control', `public, max-age=${Math.max(0, freshFor)}`);
    return response;
  },
};
