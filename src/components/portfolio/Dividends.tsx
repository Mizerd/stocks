import { shortSymbol } from '../../../shared/catalog';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import type { Valuation } from '../../lib/portfolio';
import { Notice, PanelTitle } from '../ui';

export function Dividends({ valuation }: { valuation: Valuation }) {
  const { t } = useT();
  const f = useFormat();
  const paying = valuation.positions.filter((p) => p.dividendEur != null && p.dividendEur > 0);
  const total = paying.reduce((sum, p) => sum + p.dividendEur!, 0);
  const payingValue = paying.reduce((sum, p) => sum + p.valueEur, 0);

  return (
    <div className="pnl" style={{ flex: '1 1 360px', minWidth: 0 }}>
      <PanelTitle>{t('portfolio.divs')}</PanelTitle>
      {paying.length === 0 && <Notice>{t('portfolio.divEmpty')}</Notice>}
      {paying.length > 0 && (
        <>
          <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px' }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 500 }}>{f.num(total)} €</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              {t('portfolio.divNote')} · {t('portfolio.divYield')} <span className="num">{f.plainPct((total / payingValue) * 100)}</span>
            </span>
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
            {t('portfolio.divKnown', { n: paying.length, m: valuation.positions.length })}
          </p>
          <div style={{ marginTop: 10, borderTop: '1px solid var(--hair)' }}>
            {paying.map((p) => (
              <div key={p.stock.symbol} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--hair)' }}>
                <span className="num" style={{ width: 52, fontWeight: 500 }}>{shortSymbol(p.stock.symbol)}</span>
                <span className="num" style={{ fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap' }}>
                  {f.num(p.holding.quantity, 0)} × {f.price(p.stock.dividend)} {p.stock.currency}
                </span>
                <span aria-hidden="true" style={{ flex: '1 1 0%', minWidth: 12, borderBottom: '1px dotted var(--ink3)', transform: 'translateY(-3px)' }} />
                <span className="num up" style={{ whiteSpace: 'nowrap' }}>{f.signed(p.dividendEur)} €</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
