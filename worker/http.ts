const memory = new Map<string, { expires: number; value: Promise<unknown> }>();
const MAX_ENTRIES = 400;

export class UpstreamError extends Error {}

// Keeps the result of `load` in this isolate's memory for `ttlSeconds`, so a warm isolate neither
// fetches nor parses the same thing twice. Concurrent callers share one load; failures are not kept.
export function memo<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  memory.set(key, { expires: Date.now() + ttlSeconds * 1000, value });
  value.catch(() => memory.delete(key));
  if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  return value;
}

export function edgeCache(): Cache | undefined {
  return typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
}

const background: Promise<unknown>[] = [];

// Edge-cache writes finish after the response has gone out; index.ts hands them to waitUntil.
export function takeBackgroundWork(): Promise<unknown>[] {
  return background.splice(0);
}

// Like memo, and also kept in this data centre's edge cache as JSON, so a fresh isolate reads the parsed
// result instead of fetching and parsing the source again. Each cache call counts as a subrequest.
// `load` must return plain JSON data.
export function shared<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  return memo(key, ttlSeconds, async () => {
    const edge = edgeCache();
    const url = `https://cache.internal/${encodeURIComponent(key)}`;
    const hit = await edge?.match(url).catch(() => undefined);
    if (hit) {
      // Kept in memory only for as long as the edge copy had left.
      const entry = memory.get(key);
      if (entry) entry.expires = Math.min(entry.expires, Date.parse(hit.headers.get('Expires') ?? '') || 0);
      return hit.json() as Promise<T>;
    }
    const value = await load();
    if (edge) {
      const headers = { 'Cache-Control': `max-age=${ttlSeconds}`, Expires: new Date(Date.now() + ttlSeconds * 1000).toUTCString() };
      background.push(edge.put(url, new Response(JSON.stringify(value), { headers })).catch(() => undefined));
    }
    return value;
  });
}

export function cachedText(url: string, ttlSeconds: number, accept = 'application/json'): Promise<string> {
  return memo(`text:${url}`, ttlSeconds, () => fetchText(url, accept));
}

// Parsed once per isolate and TTL. Callers must not modify the result.
export function cachedJson(url: string, ttlSeconds: number): Promise<any> {
  return memo(`json:${url}`, ttlSeconds, async () => JSON.parse(await fetchText(url)));
}

export async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetchOnce(url, '*/*');
  return new Uint8Array(await res.arrayBuffer());
}

interface FetchOptions {
  accept?: string;
  // A form body makes it a POST.
  form?: string;
  timeoutMs?: number;
}

async function fetchOnce(url: string, accept: string, options: FetchOptions = {}): Promise<Response> {
  const res = await fetch(url, {
    method: options.form ? 'POST' : 'GET',
    body: options.form,
    headers: {
      Accept: accept,
      'User-Agent': 'stocks-viewer/1.0',
      ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 12000),
  });
  if (!res.ok) throw new UpstreamError(`${new URL(url).hostname} answered ${res.status}`);
  return res;
}

// Fetches an upstream URL as text with a timeout and one retry.
export async function fetchText(url: string, accept = 'application/json', options: FetchOptions = {}): Promise<string> {
  try {
    return await (await fetchOnce(url, accept, options)).text();
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return (await fetchOnce(url, accept, options)).text();
  }
}

// "$1,234.50", "+0.19%", "DKK 272.35", "48,753,050" -> number. Empty, "--" and "N/A" -> null.
export function num(text: unknown): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[^0-9.+-]/g, '');
  if (!/[0-9]/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}
