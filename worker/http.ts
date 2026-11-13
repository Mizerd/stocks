interface Entry {
  // Served as is until `fresh`, then served stale while one refresh runs, until `expires`.
  fresh: number;
  expires: number;
  value: Promise<unknown>;
  refreshing?: boolean;
}

const memory = new Map<string, Entry>();
const MAX_ENTRIES = 400;

// How long past their freshness live prices may still be served while new ones load. Every quote
// carries its own time and freshness label, so a stale one is still shown truthfully.
export const LIVE_GRACE = 120;

export class UpstreamError extends Error {}

const background: Promise<unknown>[] = [];

// Edge-cache writes and stale-entry refreshes finish after the response has gone out; index.ts hands them to waitUntil.
export function takeBackgroundWork(): Promise<unknown>[] {
  return background.splice(0);
}

function keep(key: string, value: Promise<unknown>, ttlSeconds: number, graceSeconds: number): void {
  const now = Date.now();
  memory.set(key, { fresh: now + ttlSeconds * 1000, expires: now + (ttlSeconds + graceSeconds) * 1000, value });
  value.catch(() => memory.get(key)?.value === value && memory.delete(key));
  if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
}

// One refresh per stale entry at a time; if it fails, the stale value stays until it expires.
function refresh(key: string, entry: Entry, ttlSeconds: number, graceSeconds: number, load: () => Promise<unknown>): void {
  if (entry.refreshing) return;
  entry.refreshing = true;
  background.push(load().then(
    (value) => keep(key, Promise.resolve(value), ttlSeconds, graceSeconds),
    () => (entry.refreshing = false),
  ));
}

// Keeps the result of `load` in this isolate's memory for `ttlSeconds`, so a warm isolate neither
// fetches nor parses the same thing twice. Concurrent callers share one load; failures are not kept.
// For `graceSeconds` after that the old result is still returned while `reload` fetches a new one.
export function memo<T>(key: string, ttlSeconds: number, load: () => Promise<T>, graceSeconds = 0, reload = load): Promise<T> {
  const hit = memory.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) {
    if (hit.fresh <= now) refresh(key, hit, ttlSeconds, graceSeconds, reload);
    return hit.value as Promise<T>;
  }
  const value = load();
  keep(key, value, ttlSeconds, graceSeconds);
  return value;
}

export function edgeCache(): Cache | undefined {
  return typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
}

const cacheUrl = (key: string) => `https://cache.internal/${encodeURIComponent(key)}`;

// Keeps plain JSON data in this data centre's edge cache under a synthetic URL. Each cache call counts as a subrequest.
// Expires says until when the copy is fresh; the cache keeps it for the grace period after that.
export function edgeKeep(key: string, value: unknown, ttlSeconds: number, graceSeconds = 0): void {
  const edge = edgeCache();
  if (!edge) return;
  const headers = { 'Cache-Control': `max-age=${ttlSeconds + graceSeconds}`, Expires: new Date(Date.now() + ttlSeconds * 1000).toUTCString() };
  background.push(edge.put(cacheUrl(key), new Response(JSON.stringify(value), { headers })).catch(() => undefined));
}

function edgeMatch(key: string): Promise<Response | undefined> {
  return edgeCache()?.match(cacheUrl(key)).catch(() => undefined) ?? Promise.resolve(undefined);
}

export async function edgeRead<T>(key: string): Promise<T | null> {
  const hit = await edgeMatch(key);
  return hit ? (hit.json() as Promise<T>).catch(() => null) : null;
}

// Like memo, and also kept in this data centre's edge cache as JSON, so a fresh isolate reads the parsed
// result instead of fetching and parsing the source again. `load` must return plain JSON data.
export function shared<T>(key: string, ttlSeconds: number, load: () => Promise<T>, graceSeconds = 0): Promise<T> {
  const loadAndKeep = async () => {
    const value = await load();
    edgeKeep(key, value, ttlSeconds, graceSeconds);
    return value;
  };
  const readEdge = async () => {
    const hit = await edgeMatch(key);
    if (!hit) return loadAndKeep();
    // Kept in memory only for as long as the edge copy had left.
    const entry = memory.get(key);
    if (entry) {
      const freshUntil = Date.parse(hit.headers.get('Expires') ?? '') || 0;
      entry.fresh = Math.min(entry.fresh, freshUntil);
      entry.expires = Math.min(entry.expires, freshUntil + graceSeconds * 1000);
      if (entry.fresh <= Date.now()) refresh(key, entry, ttlSeconds, graceSeconds, loadAndKeep);
    }
    return hit.json() as Promise<T>;
  };
  return memo(key, ttlSeconds, readEdge, graceSeconds, loadAndKeep);
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
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  });
  if (!res.ok) throw new UpstreamError(`${new URL(url).hostname} answered ${res.status}`);
  return res;
}

// Fetches an upstream URL as text with a timeout and one retry. A source that timed out once is not waited on again.
export async function fetchText(url: string, accept = 'application/json', options: FetchOptions = {}): Promise<string> {
  try {
    return await (await fetchOnce(url, accept, options)).text();
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw err;
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
