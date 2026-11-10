import type { ExchangeId } from './types';

export interface Exchange {
  id: ExchangeId;
  name: string;
  short: string;
  timezone: string;
  open: string;
  close: string;
  holidays: string[];
}

// Full-day closures for 2026 and 2027. Extend this list once a year.
const US_HOLIDAYS = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
  '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
  '2027-09-06', '2027-11-25', '2027-12-24',
];
const EURONEXT_HOLIDAYS = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-12-25',
];
const COPENHAGEN_HOLIDAYS = [
  '2026-01-01', '2026-04-02', '2026-04-03', '2026-04-06', '2026-05-14', '2026-05-15', '2026-05-25',
  '2026-06-05', '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01', '2027-03-25', '2027-03-26', '2027-03-29', '2027-05-06', '2027-05-07', '2027-05-17',
  '2027-12-24', '2027-12-31',
];
const HELSINKI_HOLIDAYS = [
  '2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-06-19',
  '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01', '2027-01-06', '2027-03-26', '2027-03-29', '2027-05-06', '2027-06-25', '2027-12-06',
  '2027-12-24', '2027-12-31',
];
const VILNIUS_HOLIDAYS = [
  '2026-01-01', '2026-02-16', '2026-03-11', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14',
  '2026-06-24', '2026-07-06', '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01', '2027-02-16', '2027-03-11', '2027-03-26', '2027-03-29', '2027-05-06', '2027-06-24',
  '2027-07-06', '2027-11-01', '2027-11-02', '2027-12-24', '2027-12-31',
];
const TALLINN_HOLIDAYS = [
  '2026-01-01', '2026-02-24', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-06-23',
  '2026-06-24', '2026-08-20', '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01', '2027-02-24', '2027-03-26', '2027-03-29', '2027-05-06', '2027-06-23', '2027-06-24',
  '2027-08-20', '2027-12-24', '2027-12-31',
];

export const EXCHANGES: Record<ExchangeId, Exchange> = {
  XNAS: { id: 'XNAS', name: 'Nasdaq', short: 'Nasdaq', timezone: 'America/New_York', open: '09:30', close: '16:00', holidays: US_HOLIDAYS },
  XNYS: { id: 'XNYS', name: 'New York Stock Exchange', short: 'NYSE', timezone: 'America/New_York', open: '09:30', close: '16:00', holidays: US_HOLIDAYS },
  XAMS: { id: 'XAMS', name: 'Euronext Amsterdam', short: 'Euronext Amsterdam', timezone: 'Europe/Amsterdam', open: '09:00', close: '17:30', holidays: EURONEXT_HOLIDAYS },
  XPAR: { id: 'XPAR', name: 'Euronext Paris', short: 'Euronext Paris', timezone: 'Europe/Paris', open: '09:00', close: '17:30', holidays: EURONEXT_HOLIDAYS },
  XMIL: { id: 'XMIL', name: 'Euronext Milan', short: 'Euronext Milan', timezone: 'Europe/Rome', open: '09:00', close: '17:30', holidays: EURONEXT_HOLIDAYS },
  XCSE: { id: 'XCSE', name: 'Nasdaq Copenhagen', short: 'Nasdaq Copenhagen', timezone: 'Europe/Copenhagen', open: '09:00', close: '17:00', holidays: COPENHAGEN_HOLIDAYS },
  XHEL: { id: 'XHEL', name: 'Nasdaq Helsinki', short: 'Nasdaq Helsinki', timezone: 'Europe/Helsinki', open: '10:00', close: '18:30', holidays: HELSINKI_HOLIDAYS },
  XLIT: { id: 'XLIT', name: 'Nasdaq Vilnius', short: 'Nasdaq Vilnius', timezone: 'Europe/Vilnius', open: '10:00', close: '16:00', holidays: VILNIUS_HOLIDAYS },
  XTAL: { id: 'XTAL', name: 'Nasdaq Tallinn', short: 'Nasdaq Tallinn', timezone: 'Europe/Tallinn', open: '10:00', close: '16:00', holidays: TALLINN_HOLIDAYS },
};

// Wall-clock date and minutes since midnight in the given timezone.
export function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

// The instant at which the given timezone's wall clock shows `day` `hh:mm`.
export function zonedTime(day: string, hhmm: string, timezone: string): Date {
  const guess = new Date(`${day}T${hhmm}:00Z`);
  const shown = zonedParts(guess, timezone);
  const shownAsUtc = new Date(`${shown.day}T00:00:00Z`).getTime() + shown.minutes * 60000;
  return new Date(guess.getTime() - (shownAsUtc - guess.getTime()));
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function isTradingDay(ex: Exchange, day: string, weekday: string) {
  return weekday !== 'Sat' && weekday !== 'Sun' && !ex.holidays.includes(day);
}

export interface SessionState {
  exchange: Exchange;
  isOpen: boolean;
  // Share of the session that has elapsed, 0..1.
  progress: number;
  opensAt: Date;
  closesAt: Date;
}

export function sessionState(ex: Exchange, now: Date): SessionState {
  const local = zonedParts(now, ex.timezone);
  const open = toMinutes(ex.open);
  const close = toMinutes(ex.close);
  const tradingToday = isTradingDay(ex, local.day, local.weekday);
  const isOpen = tradingToday && local.minutes >= open && local.minutes < close;

  // Today's session if it has not finished yet, otherwise the next trading day's.
  let day = local.day;
  if (!tradingToday || local.minutes >= close) {
    let probe = zonedTime(local.day, '12:00', ex.timezone);
    for (let i = 0; i < 10; i++) {
      probe = new Date(probe.getTime() + 24 * 3600 * 1000);
      const p = zonedParts(probe, ex.timezone);
      if (isTradingDay(ex, p.day, p.weekday)) {
        day = p.day;
        break;
      }
    }
  }
  return {
    exchange: ex,
    isOpen,
    progress: isOpen ? (local.minutes - open) / (close - open) : 0,
    opensAt: zonedTime(day, ex.open, ex.timezone),
    closesAt: zonedTime(day, ex.close, ex.timezone),
  };
}

// 1-based count of trading days from 1 January up to and including today.
export function tradingDayOfYear(ex: Exchange, now: Date): number {
  const today = zonedParts(now, ex.timezone).day;
  let count = 0;
  const cursor = new Date(`${today.slice(0, 4)}-01-01T12:00:00Z`);
  for (;;) {
    const day = cursor.toISOString().slice(0, 10);
    if (day > today) return count;
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !ex.holidays.includes(day)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
