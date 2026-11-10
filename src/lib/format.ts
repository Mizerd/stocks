import type { Lang } from '../config/brand';
import { useSettings } from '../settings';

export const DASH = '—';
const MINUS = '−';
const NBSP = ' ';

const LOCALE: Record<Lang, string> = { lt: 'lt-LT', en: 'en-US' };
const LT_MONTHS = ['sau.', 'vas.', 'kov.', 'bal.', 'geg.', 'bir.', 'lie.', 'rgp.', 'rgs.', 'spa.', 'lap.', 'gru.'];
const BIG_UNITS: Record<Lang, [number, string][]> = {
  lt: [[1e12, `${NBSP}trln.`], [1e9, `${NBSP}mlrd.`], [1e6, `${NBSP}mln.`], [1e3, `${NBSP}tūkst.`]],
  en: [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']],
};

export function createFormat(lang: Lang) {
  const locale = LOCALE[lang];

  function num(value: number | null | undefined, decimals = 2, maxDecimals = decimals): string {
    if (value == null || !Number.isFinite(value)) return DASH;
    const text = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: maxDecimals,
    }).format(Math.abs(value));
    // Intl would print "-0.00" for tiny negatives; only sign what still shows as non-zero.
    const isZero = Number(Math.abs(value).toFixed(maxDecimals)) === 0;
    return value < 0 && !isZero ? MINUS + text : text;
  }

  // Always signed: +1.12 / −0.42 / 0.00.
  function signed(value: number | null | undefined, decimals = 2, maxDecimals = decimals): string {
    const text = num(value, decimals, maxDecimals);
    return value != null && value > 0 && Number(value.toFixed(maxDecimals)) !== 0 ? `+${text}` : text;
  }

  // Cheap shares (many Baltic ones trade under 10) need a third decimal.
  function price(value: number | null | undefined): string {
    return value != null && Math.abs(value) < 10 ? num(value, 2, 3) : num(value, 2);
  }

  function pct(value: number | null | undefined, decimals = 2): string {
    if (value == null || !Number.isFinite(value)) return DASH;
    return signed(value, decimals) + (lang === 'lt' ? `${NBSP}%` : '%');
  }

  function plainPct(value: number | null | undefined, decimals = 2): string {
    if (value == null || !Number.isFinite(value)) return DASH;
    return num(value, decimals) + (lang === 'lt' ? `${NBSP}%` : '%');
  }

  // 3.61T / 752B / 48.2M, or 3,61 trln. / 752 mlrd. / 48,2 mln.
  function big(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return DASH;
    for (const [size, unit] of BIG_UNITS[lang]) {
      if (Math.abs(value) >= size) {
        const scaled = value / size;
        return num(scaled, 0, Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2) + unit;
      }
    }
    return num(value, 0);
  }

  const isoDate = (d: Date, timeZone?: string) =>
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(d);

  function date(value: number | string | Date, timeZone?: string): string {
    const d = new Date(value);
    if (lang === 'lt') return isoDate(d, timeZone);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(d);
  }

  function dateShort(value: number | string | Date, timeZone?: string): string {
    const d = new Date(value);
    if (lang === 'lt') return isoDate(d, timeZone).slice(5);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(d);
  }

  function month(value: number | string | Date, withYear = false): string {
    const d = new Date(value);
    // Intl prints Lithuanian short months as numbers in some browsers, so they are spelled out here.
    const name = lang === 'lt'
      ? LT_MONTHS[d.getUTCMonth()]
      : new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
    if (!withYear) return name;
    return lang === 'lt' ? `${d.getUTCFullYear()} ${name}` : `${name} ${d.getUTCFullYear()}`;
  }

  function time(value: number | string | Date, timeZone?: string): string {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
      .format(new Date(value));
  }

  function longDate(value: Date): string {
    const text = new Intl.DateTimeFormat(lang === 'lt' ? 'lt-LT' : 'en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(value);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // "today, 18:46" style stamp: time alone if it is today, otherwise date and time.
  function stamp(value: string | number | Date): string {
    const d = new Date(value);
    const sameDay = isoDate(d) === isoDate(new Date());
    return sameDay ? time(d) : `${dateShort(d)} ${time(d)}`;
  }

  return { num, signed, price, pct, plainPct, big, date, dateShort, month, time, longDate, stamp };
}

export type Format = ReturnType<typeof createFormat>;

export function useFormat(): Format {
  const { lang } = useSettings();
  return createFormat(lang);
}

export const direction = (value: number | null | undefined) =>
  value == null || Math.abs(value) < 0.005 ? '' : value > 0 ? 'up' : 'dn';
