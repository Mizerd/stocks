import type { ReactNode } from 'react';
import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { DASH, useFormat } from '../../lib/format';
import { rangePosition } from '../../lib/returns';
import { LeaderRow } from './LeaderRow';

interface RangeProps {
  label: string;
  low: number;
  high: number;
  position: number;
  note?: ReactNode;
}

// Low and high with a marker for where the price sits between them.
function RangeBar({ label, low, high, position, note }: RangeProps) {
  const f = useFormat();
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 10px' }}>
        <span className="lbl">{label}</span>
        <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{note}</span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 18, marginTop: 4 }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: 'var(--sel)', boxShadow: 'inset 0 0 0 1px var(--hair)' }} />
        <span className="rng-dot" style={{ left: `${position}%` }} />
      </div>
      <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 12 }}>
        <span>{f.price(low)}</span>
        <span>{f.price(high)}</span>
      </div>
    </div>
  );
}

export function KeyFigures({ summary }: { summary: StockSummary }) {
  const { t } = useT();
  const f = useFormat();
  const s = summary;
  const money = (text: string) => `${text} ${s.currency}`;
  const dayPosition = s.low !== null && s.high !== null ? rangePosition(s.low, s.high, s.price) : null;
  const yearPosition = s.low52 !== null && s.high52 !== null ? rangePosition(s.low52, s.high52, s.price) : null;

  const rows = [
    { key: 'open', value: f.price(s.open) },
    { key: 'prevClose', value: f.price(s.prevClose) },
  ];
  if (s.kind === 'stock') {
    rows.push(
      { key: 'volume', value: f.big(s.volume) },
      { key: 'avgVolume', value: f.big(s.avgVolume) },
      { key: 'relVolume', value: s.volume !== null && s.avgVolume ? `${f.num(s.volume / s.avgVolume)}×` : DASH },
      { key: 'marketCap', value: s.marketCap !== null ? money(f.big(s.marketCap)) : DASH },
      { key: 'pe', value: f.num(s.pe, 1) },
      { key: 'eps', value: s.eps !== null ? money(f.num(s.eps)) : DASH },
      { key: 'dividend', value: s.dividend !== null ? `${money(f.num(s.dividend))} · ${f.plainPct(s.dividendYield)}` : DASH },
    );
  }

  return (
    <>
      <h2 className="ser pnl-title" style={{ marginBottom: 8 }}>{t('stock.stats')}</h2>
      {rows.map((row) => (
        <LeaderRow key={row.key} label={t(`stock.sk.${row.key}`)} numeric>{row.value}</LeaderRow>
      ))}
      {dayPosition !== null && <RangeBar label={t('stock.sk.dayRange')} low={s.low!} high={s.high!} position={dayPosition} />}
      {yearPosition !== null && (
        <RangeBar
          label={t('stock.w52')}
          low={s.low52!}
          high={s.high52!}
          position={yearPosition}
          note={
            <>
              <span className="num">{f.pct(Math.max(0, (s.price / s.low52! - 1) * 100), 1)}</span> {t('stock.w52l')}
              {' · '}
              <span className="num">{f.pct(Math.min(0, (s.price / s.high52! - 1) * 100), 1)}</span> {t('stock.w52n')}
            </>
          }
        />
      )}
    </>
  );
}
