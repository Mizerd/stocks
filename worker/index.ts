import { findInstrument, INDICES, STOCKS } from '../shared/catalog';
import type { Instrument, ProviderStatus, Range } from '../shared/types';
import { detail, history, PROVIDERS, summary } from './market';
import { fxRates } from './providers/ecb';
import { balticNews } from './providers/news';
import { about } from './providers/wikipedia';

const RANGES: Range[] = ['1D', '5D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'];
// Keeps one request comfortably under the Workers free-plan limit of 50 subrequests.
const MAX_SYMBOLS = 8;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function instrumentParam(url: URL): Instrument {
  const inst = findInstrument(url.searchParams.get('symbol') ?? '');
  if (!inst) throw new HttpError(404, 'Unknown symbol');
  return inst;
}

async function summaries(instruments: Instrument[]) {
  const results = await Promise.allSettled(instruments.map(summary));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = instruments.filter((_, i) => results[i].status === 'rejected').map((i) => i.symbol);
  return json({ items, failed }, 200, failed.length ? 0 : 60);
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
  return json({ checkedAt: new Date().toISOString(), providers: await Promise.all(checks) });
}

async function route(url: URL): Promise<Response> {
  switch (url.pathname) {
    case '/api/stocks': {
      const requested = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
      if (requested.length === 0 || requested.length > MAX_SYMBOLS) {
        throw new HttpError(400, `Pass 1 to ${MAX_SYMBOLS} symbols`);
      }
      const instruments = requested.map((s) => findInstrument(s));
      if (instruments.some((i) => !i)) throw new HttpError(404, 'Unknown symbol');
      return summaries(instruments as Instrument[]);
    }
    case '/api/indices':
      return summaries(INDICES);
    case '/api/history': {
      const range = url.searchParams.get('range') as Range;
      if (!RANGES.includes(range)) throw new HttpError(400, 'Unknown range');
      const data = await history(instrumentParam(url), range);
      if (!data) return json({ unavailable: true }, 200, 300);
      return json(data, 200, range === '1D' ? 120 : 900);
    }
    case '/api/detail':
      return json(await detail(instrumentParam(url)), 200, 60);
    case '/api/fx':
      return json(await fxRates(), 200, 3600);
    case '/api/news':
      return json(await balticNews(url.searchParams.get('lang') === 'lt' ? 'lt' : 'en'), 200, 300);
    case '/api/about': {
      const lang = url.searchParams.get('lang') === 'lt' ? 'lt' : 'en';
      const data = await about(instrumentParam(url), lang);
      if (!data) return json({ unavailable: true }, 200, 86400);
      // An English fallback for a Lithuanian reader is kept for an hour only, in case the Lithuanian fetch merely failed.
      return json(data, 200, data.lang === lang ? 86400 : 3600);
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

export default {
  // Complete responses are kept in the edge cache for as long as their Cache-Control allows.
  async fetch(request: Request, _env?: unknown, ctx?: Context): Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'Read-only API' }, 405);
    const edge = typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
    const cached = await edge?.match(request);
    if (cached) return cached;
    const response = await respond(request);
    if (edge && response.headers.get('Cache-Control')?.startsWith('public')) {
      const stored = edge.put(request, response.clone());
      if (ctx) ctx.waitUntil(stored);
      else await stored;
    }
    return response;
  },
};
