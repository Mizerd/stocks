import type { QuarterFigure } from '../../shared/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The source labels quarters as "9/26/2026" (revenue) or "Sep 2026" (EPS).
export function periodTime(period: string): number {
  if (period.includes('/')) {
    const [month, , year] = period.split('/').map(Number);
    return Date.UTC(year, month - 1);
  }
  const [month, year] = period.split(' ');
  return Date.UTC(Number(year), MONTHS.indexOf(month));
}

export interface QuarterRow {
  time: number;
  revenue: number | null;
  // Revenue change on the quarter before, in percent.
  revenueChange: number | null;
  eps: number | null;
  estimate: number | null;
  // How far reported EPS landed from the analyst estimate, in percent of the estimate.
  surprise: number | null;
}

// Revenue and EPS joined by quarter, the latest first.
export function quarterRows(revenue: QuarterFigure[], eps: QuarterFigure[], count = 4): QuarterRow[] {
  const revenueAt = new Map(revenue.map((q) => [periodTime(q.period), q.value]));
  const epsAt = new Map(eps.map((q) => [periodTime(q.period), q]));
  const times = [...new Set([...revenueAt.keys(), ...epsAt.keys()])].sort((a, b) => a - b);

  return times
    .map((time, i) => {
      const now = revenueAt.get(time) ?? null;
      const before = revenueAt.get(times[i - 1]);
      const reported = epsAt.get(time);
      const estimate = reported?.estimate ?? null;
      return {
        time,
        revenue: now,
        revenueChange: now !== null && before ? (now / before - 1) * 100 : null,
        eps: reported?.value ?? null,
        estimate,
        surprise: reported && estimate ? ((reported.value - estimate) / Math.abs(estimate)) * 100 : null,
      };
    })
    .slice(-count)
    .reverse();
}
