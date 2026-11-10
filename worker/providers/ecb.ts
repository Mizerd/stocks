import type { FxRates } from '../../shared/types';
import { cachedText, UpstreamError } from '../http';

const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

export function parseEcbRates(xml: string): FxRates {
  const date = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1];
  if (!date) throw new UpstreamError('Unexpected ECB rates format');
  const perEur: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/currency='([A-Z]{3})' rate='([0-9.]+)'/g)) perEur[m[1]] = Number(m[2]);
  return { date, perEur };
}

export async function fxRates(): Promise<FxRates> {
  return parseEcbRates(await cachedText(URL, 6 * 3600, 'application/xml'));
}
