// "LIVE" with a pulsing dot while a market is trading; a quiet outline otherwise.
export function LivePill({ live, children }: { live: boolean; children: string }) {
  return (
    <span className={`pill${live ? ' on' : ''}`}>
      {live && <span className="pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
