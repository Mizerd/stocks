import type { StockSummary } from '../../../shared/types';
import { useT } from '../../i18n';
import { DASH, useFormat } from '../../lib/format';
import { LeaderRow } from './LeaderRow';

function YearRange({ low, high, price }: { low: number; high: number; price: number }) {
  const { t } = useT();
  const f = useFormat();
  const position = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span className="lbl">{t('stock.w52')}</span>
        <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
          <span className="num">{f.pct(Math.min(0, (price / high - 1) * 100), 1)}</span> {t('stock.w52n')}
        </span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', height: 18, marginTop: 8 }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: 'var(--sel)', boxShadow: 'inset 0 0 0 1px var(--hair)' }} />
        <span style={{ position: 'absolute', left: `${position}%`, top: 2, width: 14, height: 14, marginLeft: -7, borderRadius: '50%', background: 'var(--gild)', boxShadow: '0 0 0 3px var(--paper)' }} />
      </div>
      <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
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

  const rows = [
    { key: 'open', value: f.price(s.open) },
    { key: 'dayRange', value: s.low !== null && s.high !== null ? `${f.price(s.low)} – ${f.price(s.high)}` : DASH },
    { key: 'prevClose', value: f.price(s.prevClose) },
  ];
  if (s.kind === 'stock') {
    rows.push(
      { key: 'volume', value: f.big(s.volume) },
      { key: 'avgVolume', value: f.big(s.avgVolume) },
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
      {s.low52 !== null && s.high52 !== null && s.high52 > s.low52 && <YearRange low={s.low52} high={s.high52} price={s.price} />}
    </>
  );
}
