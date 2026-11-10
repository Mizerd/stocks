import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import type { Slice } from '../../lib/portfolio';
import { PanelTitle } from '../ui';

// Steps of one ink tint, darkest for the largest slice. Never a rainbow.
const TINTS = [100, 74, 54, 38, 26, 16, 10];

const tint = (i: number) => `color-mix(in oklab, var(--ink) ${TINTS[Math.min(i, TINTS.length - 1)]}%, var(--paper))`;

export function Allocation({ slices }: { slices: Slice[] }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <div className="pnl" style={{ flex: '1 1 380px' }}>
      <PanelTitle>{t('portfolio.alloc')}</PanelTitle>
      <p className="pnl-note" style={{ marginBottom: 14 }}>{t('portfolio.allocNote')}</p>
      <div role="img" aria-label={t('portfolio.alloc')} style={{ display: 'flex', gap: 2, height: 30, borderRadius: 6, overflow: 'hidden' }}>
        {slices.map((s, i) => (
          <span key={s.sector} style={{ width: `${s.share * 100}%`, background: tint(i) }} />
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {slices.map((s, i) => (
          <div key={s.sector} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr) 64px 96px', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--hair)' }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: tint(i) }} />
            <span className="clip">{t(`portfolio.sec.${s.sector}`)}</span>
            <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{f.plainPct(s.share * 100, 1)}</span>
            <span className="num" style={{ fontSize: 12.5, textAlign: 'right', color: 'var(--ink2)' }}>{f.num(s.valueEur, 0)} €</span>
          </div>
        ))}
      </div>
    </div>
  );
}
