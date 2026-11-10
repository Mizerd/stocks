import { EXCHANGES, sessionState, type SessionState } from '../../shared/exchanges';
import { useT } from '../i18n';
import { useFormat } from '../lib/format';
import { useNow } from '../lib/useNow';

// One exchange per trading bloc; the widget follows whichever is in session.
const MARKETS = [
  { exchange: EXCHANGES.XNAS, label: 'NYSE · Nasdaq' },
  { exchange: EXCHANGES.XAMS, label: 'Euronext' },
  { exchange: EXCHANGES.XLIT, label: 'Nasdaq Vilnius' },
];

// An open market if there is one (the US first), otherwise the next one to open.
export function pickSession(now: Date): SessionState & { label: string } {
  const states = MARKETS.map((m) => ({ ...sessionState(m.exchange, now), label: m.label }));
  return (
    states.find((s) => s.isOpen) ??
    states.reduce((soonest, s) => (s.opensAt < soonest.opensAt ? s : soonest))
  );
}

export function SessionWidget() {
  const { t } = useT();
  const f = useFormat();
  const now = useNow();
  const session = pickSession(now);

  const target = session.isOpen ? session.closesAt : session.opensAt;
  const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const left = hours > 0 ? t('common.hm', { h: hours, m: minutes % 60 }) : t('common.min', { m: minutes });

  return (
    <div style={{ flex: '0 1 300px', minWidth: 240 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <span
            className={session.isOpen ? 'live' : ''}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: session.isOpen ? 'var(--up)' : 'var(--ink3)',
              animation: session.isOpen ? 'pulse 2s ease infinite' : undefined,
            }}
          />
          {t(session.isOpen ? 'common.open' : 'common.closed')}
        </span>
        <span style={{ color: 'var(--ink2)' }}>{t(session.isOpen ? 'common.closeIn' : 'common.openIn', { t: left })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={session.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(session.progress * 100)}
        style={{ height: 6, marginTop: 8, border: '1px solid var(--ink)', borderRadius: 1 }}
      >
        <div style={{ width: `${session.progress * 100}%`, height: '100%', background: 'var(--ink)' }} />
      </div>
      <div className="num" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
        <span>{f.time(session.opensAt)}</span>
        <span>{session.label}</span>
        <span>{f.time(session.closesAt)}</span>
      </div>
    </div>
  );
}
