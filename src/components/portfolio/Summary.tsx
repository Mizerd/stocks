import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import type { Valuation } from '../../lib/portfolio';

// The four headline figures. `valueNote` and `costNote` are the small lines under the first and last.
export function Summary({ valuation, valueNote, costNote }: { valuation: Valuation; valueNote: ReactNode; costNote?: ReactNode }) {
  const { t } = useT();
  const f = useFormat();
  const small = { margin: '4px 0 0', fontSize: 13, fontWeight: 500 };
  const note = { margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink3)' };
  return (
    <div className="pnl sum">
      <div>
        <p className="lbl" style={{ margin: 0 }}>{t('portfolio.sVal')}</p>
        <p className="num" style={{ margin: '4px 0 0', fontSize: 'clamp(30px, 3vw, 40px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {f.num(valuation.totalEur)} <span style={{ fontSize: 20 }}>€</span>
        </p>
        <p style={note}>{valueNote}</p>
      </div>
      <div>
        <p className="lbl" style={{ margin: 0 }}>{t('portfolio.sDay')}</p>
        <p className={`num sum-fig ${direction(valuation.dayEur)}`}>{f.signed(valuation.dayEur)} €</p>
        <p className={`num ${direction(valuation.dayPct)}`} style={small}>{f.pct(valuation.dayPct)}</p>
      </div>
      <div>
        <p className="lbl" style={{ margin: 0 }}>{t('portfolio.sPl')}</p>
        <p className={`num sum-fig ${direction(valuation.gainEur)}`}>{f.signed(valuation.gainEur)} €</p>
        <p className={`num ${direction(valuation.gainPct)}`} style={small}>{f.pct(valuation.gainPct, 1)}</p>
      </div>
      <div>
        <p className="lbl" style={{ margin: 0 }}>{t('portfolio.sInv')}</p>
        <p className="num sum-fig">{f.num(valuation.costEur)} €</p>
        {costNote && <p style={note}>{costNote}</p>}
      </div>
    </div>
  );
}
