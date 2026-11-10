const memory = new Map<string, { expires: number; body: string }>();

export class UpstreamError extends Error {}

// Fetches an upstream URL as text with a timeout, one retry, and two cache layers:
// a per-isolate map and the edge cache. Only URLs built by the providers come through here.
export async function cachedText(url: string, ttlSeconds: number, accept = 'application/json'): Promise<string> {
  const hit = memory.get(url);
  if (hit && hit.expires > Date.now()) return hit.body;

  const cacheKey = new Request(url);
  const edge = typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
  const cached = await edge?.match(cacheKey);
  let body: string;
  if (cached) {
    body = await cached.text();
  } else {
    body = await fetchWithRetry(url, accept);
    await edge?.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `max-age=${ttlSeconds}` } }));
  }
  memory.set(url, { expires: Date.now() + ttlSeconds * 1000, body });
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
  return body;
}

export async function cachedBytes(url: string, ttlSeconds: number): Promise<Uint8Array> {
  const cacheKey = new Request(url);
  const edge = typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default;
  const cached = await edge?.match(cacheKey);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const res = await fetchOnce(url, '*/*');
  const bytes = new Uint8Array(await res.arrayBuffer());
  await edge?.put(cacheKey, new Response(bytes, { headers: { 'Cache-Control': `max-age=${ttlSeconds}` } }));
  return bytes;
}

async function fetchOnce(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: accept, 'User-Agent': 'stocks-viewer/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new UpstreamError(`${new URL(url).hostname} answered ${res.status}`);
  return res;
}

async function fetchWithRetry(url: string, accept: string): Promise<string> {
  try {
    return await (await fetchOnce(url, accept)).text();
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return (await fetchOnce(url, accept)).text();
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
