import { INDICES } from '../../shared/catalog';
import { Alerts } from '../components/portfolio/Alerts';
import { Allocation } from '../components/portfolio/Allocation';
import { Dividends } from '../components/portfolio/Dividends';
import { Holdings } from '../components/portfolio/Holdings';
import { Performance } from '../components/portfolio/Performance';
import { ErrorNotice, Loading } from '../components/ui';
import { useT } from '../i18n';
import { useFx, useStocks } from '../lib/api';
import { direction, useFormat } from '../lib/format';
import { allocation, SAMPLE_PORTFOLIO, valuePortfolio, type Valuation } from '../lib/portfolio';
import { usePageTitle } from '../lib/usePageTitle';

const { holdings, alerts, cashEur } = SAMPLE_PORTFOLIO;
const SYMBOLS = [...new Set([...holdings, ...alerts].map((item) => item.symbol))];
const BENCHMARK = INDICES.find((i) => i.symbol === SAMPLE_PORTFOLIO.benchmark)!;

function Summary({ valuation }: { valuation: Valuation }) {
  const { t } = useT();
  const f = useFormat();
  const small = { margin: '4px 0 0', fontSize: 13, fontWeight: 500 };
  return (
    <div className="pnl sum">
      <div>
        <p className="lbl" style={{ margin: 0 }}>{t('portfolio.sVal')}</p>
        <p className="num" style={{ margin: '4px 0 0', fontSize: 'clamp(30px, 3vw, 40px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {f.num(valuation.totalEur)} <span style={{ fontSize: 20 }}>€</span>
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
          {t('portfolio.cashIn')} <span className="num">{f.num(cashEur)} €</span>
        </p>
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
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.demoTag')}</p>
      </div>
    </div>
  );
}

export function Portfolio() {
  const { t } = useT();
  usePageTitle(t('portfolio.title'));
  const { stocks, loading, error } = useStocks(SYMBOLS);
  const fx = useFx();

  if (loading || fx.loading) return <main className="wrap page"><Loading height={420} /></main>;
  if (error || !fx.data) return <main className="wrap page"><ErrorNotice height={420} /></main>;

  const valuation = valuePortfolio(holdings, stocks, fx.data, cashEur);
  const missing = holdings.filter((h) => !valuation.positions.some((p) => p.holding === h)).map((h) => h.symbol);

  return (
    <main className="wrap page">
      <section>
        <p className="lbl" style={{ margin: '0 0 10px' }}>{t('portfolio.acct')}</p>
        <h1 className="ser h1">{t('portfolio.title')}</h1>
        <p className="ser lead" style={{ maxWidth: '44em' }}>{t('portfolio.demo')}</p>
        <Summary valuation={valuation} />
        {missing.length > 0 && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>{t('portfolio.missing', { list: missing.join(', ') })}</p>
        )}
      </section>
      <section className="cols">
        <Performance positions={valuation.positions} fx={fx.data} benchmark={BENCHMARK} />
        <Allocation slices={allocation(valuation, cashEur)} />
      </section>
      <Holdings valuation={valuation} fx={fx.data} />
      <section className="cols">
        <Alerts alerts={alerts} stocks={stocks} />
        <Dividends valuation={valuation} />
      </section>
    </main>
  );
}
