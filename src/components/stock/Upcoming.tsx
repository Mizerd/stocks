import type { ReactNode } from 'react';
import type { StockSummary, Upcoming as UpcomingDates } from '../../../shared/types';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import { LeaderRow } from './LeaderRow';

function DateValue({ day, note }: { day: string; note?: ReactNode }) {
  const f = useFormat();
  return (
    <>
      {f.date(`${day}T00:00:00Z`, 'UTC')}
      {note && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--ink3)' }}>{note}</span>}
    </>
  );
}

// Next earnings report and dividend dates. Nothing is shown when the source announces none.
export function Upcoming({ upcoming, summary }: { upcoming: UpcomingDates; summary: StockSummary }) {
  const { t } = useT();
  const f = useFormat();
  const { earnings, dividend } = upcoming;
  if (!earnings && !dividend) return null;
  const timing = earnings?.timing && t(earnings.timing === 'pre' ? 'stock.upPre' : 'stock.upPost');
  const earningsNote = [timing, earnings?.estimated && t('stock.upEst')].filter(Boolean).join(' · ');
  const amount = dividend?.amount != null && t('stock.upAmount', { amount: `${f.price(dividend.amount)} ${summary.currency}` });

  return (
    <section className="pnl">
      <h2 className="ser pnl-title" style={{ marginBottom: 8 }}>{t('stock.up')}</h2>
      {earnings && (
        <LeaderRow label={t('stock.upEarn')} numeric><DateValue day={earnings.day} note={earningsNote} /></LeaderRow>
      )}
      {dividend?.exDay && (
        <LeaderRow label={t('stock.upEx')} numeric><DateValue day={dividend.exDay} note={amount} /></LeaderRow>
      )}
      {dividend?.payDay && (
        <LeaderRow label={t('stock.upPay')} numeric>
          <DateValue day={dividend.payDay} note={dividend.exDay ? undefined : amount} />
        </LeaderRow>
      )}
    </section>
  );
}
