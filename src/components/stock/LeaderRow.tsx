import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
  numeric?: boolean;
  padding?: number;
}

// Label, dotted leader, value.
export function LeaderRow({ label, children, numeric = false, padding = 6 }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: `${padding}px 0` }}>
      <span style={{ color: 'var(--ink2)' }}>{label}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, borderBottom: '1px dotted var(--hair)', transform: 'translateY(-3px)' }} />
      <span className={numeric ? 'num' : undefined} style={{ fontSize: 13.5, fontWeight: 500, textAlign: 'right' }}>{children}</span>
    </div>
  );
}
