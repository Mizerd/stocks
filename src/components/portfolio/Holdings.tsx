import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { FxRates } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import type { Valuation } from '../../lib/portfolio';
import { Badge, PanelTitle } from '../ui';

const COLUMNS = '70px minmax(140px, 1.5fr) 64px 92px 108px 116px 92px minmax(190px, 1.3fr) minmax(110px, 1fr)';

export function Holdings({ valuation, fx }: { valuation: Valuation; fx: FxRates }) {
  const { t } = useT();
  const f = useFormat();
  const largest = Math.max(...valuation.positions.map((p) => p.weight));
  const currencies = [...new Set(valuation.positions.map((p) => p.stock.currency))].filter((c) => c !== 'EUR');
  const rates = currencies.map((c) => `1 EUR = ${f.num(fx.perEur[c], 4)} ${c}`).join(' · ');

  return (
    <section className="pnl">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <PanelTitle>{t('portfolio.hold')}</PanelTitle>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.fxNote', { date: f.date(fx.date, 'UTC'), rates })}</span>
      </div>
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <div style={{ minWidth: 1040 }}>
          <div className="lbl" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, padding: 8, borderBottom: '1px solid var(--ink)' }}>
            <span>{t('portfolio.cSym')}</span>
            <span>{t('portfolio.cName')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cQty')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cAvg')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cPrice')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cVal')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cDay')}</span>
            <span style={{ textAlign: 'right' }}>{t('portfolio.cPl')}</span>
            <span>{t('portfolio.cW')}</span>
          </div>
          {valuation.positions.map((p) => (
            <Link
              key={p.stock.symbol}
              to={`/stock/${p.stock.symbol}`}
              className="row"
              style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 14, height: 46, padding: '0 8px', borderBottom: '1px solid var(--hair)' }}
            >
              <span className="num" style={{ fontWeight: 500 }}>{shortSymbol(p.stock.symbol)}</span>
              <span className="clip">{p.stock.name}</span>
              <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{f.num(p.holding.quantity, 0)}</span>
              <span className="num" style={{ fontSize: 13, textAlign: 'right', color: 'var(--ink2)' }}>{f.price(p.holding.avgCost)}</span>
              <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>
                {f.price(p.stock.price)} <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{p.stock.currency}</span>
              </span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 500 }}>{f.num(p.valueEur)} €</span>
              <span style={{ textAlign: 'right' }}><Badge value={p.stock.changePct} /></span>
              <span className={`num ${direction(p.gainEur)}`} style={{ fontSize: 13, textAlign: 'right' }}>
                {f.signed(p.gainEur)} € · {f.pct(p.gainPct, 1)}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: '1 1 0%', height: 6, background: 'var(--sel)' }}>
                  <span style={{ display: 'block', width: `${(p.weight / largest) * 100}%`, height: '100%', background: 'var(--ink)' }} />
                </span>
                <span className="num" style={{ width: 52, fontSize: 12.5, textAlign: 'right', color: 'var(--ink2)' }}>{f.plainPct(p.weight * 100, 1)}</span>
              </span>
            </Link>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', gap: 14, height: 48, padding: '0 8px', borderTop: '1px solid var(--ink)', marginTop: -1, fontWeight: 600 }}>
            <span />
            <span>{t('portfolio.total')}</span>
            <span />
            <span />
            <span />
            <span className="num" style={{ textAlign: 'right' }}>{f.num(valuation.holdingsEur)} €</span>
            <span className={`num ${direction(valuation.dayPct)}`} style={{ fontSize: 12.5, textAlign: 'right', paddingRight: 8 }}>{f.pct(valuation.dayPct)}</span>
            <span className={`num ${direction(valuation.gainEur)}`} style={{ fontSize: 13, textAlign: 'right' }}>
              {f.signed(valuation.gainEur)} € · {f.pct(valuation.gainPct, 1)}
            </span>
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
