import { Link } from 'react-router-dom';
import { shortSymbol } from '../../../shared/catalog';
import type { FxRates } from '../../../shared/types';
import { useT } from '../../i18n';
import { direction, useFormat } from '../../lib/format';
import type { Valuation } from '../../lib/portfolio';
import { Badge, PanelTitle } from '../ui';

export function Holdings({ valuation, fx }: { valuation: Valuation; fx: FxRates }) {
  const { t } = useT();
  const f = useFormat();
  const largest = Math.max(...valuation.positions.map((p) => p.weight));
  const currencies = [...new Set(valuation.positions.map((p) => p.stock.currency))].filter((c) => c !== 'EUR');
  const rates = currencies.map((c) => `1 EUR = ${f.num(fx.perEur[c], 4)} ${c}`).join(' · ');

  return (
    <section className="pnl">
      <div className="pnl-head">
        <PanelTitle>{t('portfolio.hold')}</PanelTitle>
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.fxNote', { date: f.date(fx.date, 'UTC'), rates })}</span>
      </div>
      <div className="scroll-x" style={{ marginTop: 10 }}>
        <div className="hd">
          <div className="lbl tbl-head hd-cols">
            <span>{t('portfolio.cSym')}</span>
            <span>{t('portfolio.cName')}</span>
            <span className="r c-qty">{t('portfolio.cQty')}</span>
            <span className="r c-avg">{t('portfolio.cAvg')}</span>
            <span className="r">{t('portfolio.cPrice')}</span>
            <span className="r">{t('portfolio.cVal')}</span>
            <span className="r">{t('portfolio.cDay')}</span>
            <span className="r">{t('portfolio.cPl')}</span>
            <span className="c-w">{t('portfolio.cW')}</span>
          </div>
          {valuation.positions.map((p) => (
            <Link key={p.stock.symbol} to={`/stock/${p.stock.symbol}`} className="row tbl-row hd-cols">
              <span className="num c-sym" style={{ fontWeight: 600 }}>{shortSymbol(p.stock.symbol)}</span>
              <span className="clip c-name">{p.stock.name}</span>
              <span className="num r c-qty" style={{ fontSize: 13 }}>{f.num(p.holding.quantity, 0)}</span>
              <span className="num r c-avg" style={{ fontSize: 13, color: 'var(--ink2)' }}>{f.price(p.holding.avgCost)}</span>
              <span className="num r c-price" style={{ fontSize: 13 }}>
                {f.price(p.stock.price)} <span className="cur">{p.stock.currency}</span>
              </span>
              <span className="num r c-val" style={{ fontWeight: 600 }}>{f.num(p.valueEur)} €</span>
              <span className="r c-day"><Badge value={p.stock.changePct} /></span>
              <span className={`num r c-pl ${direction(p.gainEur)}`} style={{ fontSize: 13 }}>
                {f.signed(p.gainEur)} € · {f.pct(p.gainPct, 1)}
              </span>
              <span className="c-w hd-w">
                <span style={{ flex: '1 1 0%', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--sel)' }}>
                  <span style={{ display: 'block', width: `${(p.weight / largest) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--ink)' }} />
                </span>
                <span className="num" style={{ width: 52, fontSize: 12.5, textAlign: 'right', color: 'var(--ink2)' }}>{f.plainPct(p.weight * 100, 1)}</span>
              </span>
            </Link>
          ))}
          <div className="tbl-row hd-cols tot" style={{ borderTop: '1px solid var(--ink3)', fontWeight: 600 }}>
            <span className="c-sym" />
            <span className="c-name">{t('portfolio.total')}</span>
            <span className="c-qty" />
            <span className="c-avg" />
            <span className="c-price" />
            <span className="num r c-val">{f.num(valuation.holdingsEur)} €</span>
            <span className={`num r c-day ${direction(valuation.dayPct)}`} style={{ fontSize: 12.5, paddingRight: 8 }}>{f.pct(valuation.dayPct)}</span>
            <span className={`num r c-pl ${direction(valuation.gainEur)}`} style={{ fontSize: 13 }}>
              {f.signed(valuation.gainEur)} € · {f.pct(valuation.gainPct, 1)}
            </span>
            <span className="c-w" />
          </div>
        </div>
      </div>
    </section>
  );
}
