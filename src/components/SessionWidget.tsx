import { useMatch } from 'react-router-dom';
import { EXCHANGES, sessionState, type SessionState } from '../../shared/exchanges';
import { useT } from '../i18n';
import { useFormat } from '../lib/format';
import { useInstrument } from '../lib/universe';
import { useNow } from '../lib/useNow';

// One exchange per trading bloc, shown when the page is not about a single stock.
const BLOCS = [
  { exchange: EXCHANGES.XNAS, key: 'us' },
  { exchange: EXCHANGES.XAMS, key: 'eu' },
  { exchange: EXCHANGES.XLIT, key: 'bal' },
];

const DAY_MS = 24 * 3600 * 1000;

// "2 h 10 min" to the next bell.
function timeLeft(session: SessionState, now: Date, t: ReturnType<typeof useT>['t']): string {
  const target = session.isOpen ? session.closesAt : session.opensAt;
  const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? t('common.hm', { h: hours, m: minutes % 60 }) : t('common.min', { m: minutes });
}

// "16:00", or "Mon 10:00" when the next bell is on another day.
function useBellAt(now: Date) {
  const { lang } = useT();
  const f = useFormat();
  return (session: SessionState) => {
    const at = session.isOpen ? session.closesAt : session.opensAt;
    if (at.toDateString() === now.toDateString()) return f.time(at);
    return `${new Intl.DateTimeFormat(lang === 'lt' ? 'lt-LT' : 'en-GB', { weekday: 'short' }).format(at)} ${f.time(at)}`;
  };
}

const Dot = ({ open }: { open: boolean }) => <span className={`sess-dot${open ? ' on live' : ''}`} aria-hidden="true" />;

// Phones: "● Europe / opens Mon 10:00" in two short lines.
function Mini({ label, session, now }: { label: string; session: SessionState; now: Date }) {
  const { t } = useT();
  const bellAt = useBellAt(now);
  return (
    <div className="sess-mini">
      <span className="sess-mini-k"><Dot open={session.isOpen} />{label}</span>
      <span className="num">{t(session.isOpen ? 'common.closesAt' : 'common.opensAt', { t: bellAt(session) })}</span>
    </div>
  );
}

// A stock page: its own exchange's session as a bar from the opening to the closing bell.
function ExchangeSession({ session, now }: { session: SessionState; now: Date }) {
  const { t } = useT();
  const f = useFormat();
  const left = timeLeft(session, now, t);
  const bellAt = useBellAt(now);
  const state = t(session.isOpen ? 'common.open' : 'common.closed');
  return (
    <div className="sess">
      <div className="sess-full">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, whiteSpace: 'nowrap' }}>
            <Dot open={session.isOpen} />
            {state}
          </span>
          <span style={{ color: 'var(--ink2)', textAlign: 'right' }}>
            {session.opensAt.getTime() - now.getTime() > DAY_MS
              ? t('common.opensAt', { t: bellAt(session) })
              : t(session.isOpen ? 'common.closeIn' : 'common.openIn', { t: left })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={session.exchange.short}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(session.progress * 100)}
          style={{ height: 6, marginTop: 7, borderRadius: 3, background: 'var(--sel)', overflow: 'hidden' }}
        >
          <div style={{ width: `${session.progress * 100}%`, height: '100%', borderRadius: 3, background: 'var(--ink)' }} />
        </div>
        <div className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--ink3)' }}>
          <span>{f.time(session.opensAt)}</span>
          <span className="clip">{session.exchange.short}</span>
          <span>{f.time(session.closesAt)}</span>
        </div>
      </div>
      <Mini label={state} session={session} now={now} />
    </div>
  );
}

// Other pages: the US, Europe and the Baltics, each with the time to its next bell.
function BlocSessions({ now }: { now: Date }) {
  const { t } = useT();
  const bellAt = useBellAt(now);
  const sessions = BLOCS.map((b) => ({ label: t(`common.bloc.${b.key}`), session: sessionState(b.exchange, now) }));
  // On phones only one fits: an open bloc (the US first), otherwise the next to open.
  const first =
    sessions.find((s) => s.session.isOpen) ??
    sessions.reduce((soonest, s) => (s.session.opensAt < soonest.session.opensAt ? s : soonest));
  return (
    <div className="sess">
      <ul className="sess-full sess-blocs">
        {sessions.map(({ label, session }) => (
          <li key={label}>
            <span className="sess-mini-k"><Dot open={session.isOpen} />{label}</span>
            <span className={`sess-state${session.isOpen ? '' : ' off'}`}>{t(session.isOpen ? 'common.isOpen' : 'common.isClosed')}</span>
            <span className="num">
              {session.opensAt.getTime() - now.getTime() > DAY_MS
                ? t('common.opensAt', { t: bellAt(session) })
                : t(session.isOpen ? 'common.closesIn' : 'common.opensIn', { t: timeLeft(session, now, t) })}
            </span>
          </li>
        ))}
      </ul>
      <Mini label={first.label} session={first.session} now={now} />
    </div>
  );
}

export function SessionWidget() {
  const now = useNow();
  const match = useMatch('/stock/:symbol');
  const { listing } = useInstrument(match?.params.symbol ?? '');
  if (listing) return <ExchangeSession session={sessionState(EXCHANGES[listing.exchange], now)} now={now} />;
  return <BlocSessions now={now} />;
}
