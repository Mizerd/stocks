import type { ReactNode } from 'react';
import type { Freshness } from '../../shared/types';
import { useT } from '../i18n';
import { sparkPath } from '../lib/chart';
import { direction, useFormat } from '../lib/format';

interface SegProps<T extends string> {
  label: string;
  options: { value: NoInfer<T>; label: string; disabled?: boolean }[];
  value: T;
  onChange(value: NoInfer<T>): void;
}

// Segmented control: one choice out of a few.
export function Seg<T extends string>({ label, options, value, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          disabled={o.disabled}
          style={o.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Percentage change on a tinted background.
export function Badge({ value, size = 12.5 }: { value: number | null; size?: number }) {
  const f = useFormat();
  return (
    <span className={`num bdg ${direction(value)}`} style={{ fontSize: size }}>
      {f.pct(value)}
    </span>
  );
}

interface SparklineProps {
  values: number[];
  change: number | null;
  width?: number | string;
  height?: number;
}

export function Sparkline({ values, change, width = '100%', height = 26 }: SparklineProps) {
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" width={width} height={height} aria-hidden="true">
      <path className={`sl ${direction(change)}`} d={sparkPath(values)} />
    </svg>
  );
}

// "Delayed 15 min · 16:22": how fresh a price is and when it was published.
export function FreshnessNote({ freshness, time }: { freshness: Freshness; time: string }) {
  const { t } = useT();
  const f = useFormat();
  return (
    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
      {t(`common.${freshness}`)} · <span className="num">{f.stamp(time)}</span>
    </span>
  );
}

export function Loading({ height = 120 }: { height?: number }) {
  const { t } = useT();
  return (
    <div className="note" role="status" style={{ minHeight: height }}>
      <span className="skel" style={{ width: 120, height: 6 }} />
      <p style={{ fontSize: 12.5 }}>{t('common.loading')}</p>
    </div>
  );
}

// An italic serif line for empty, missing and failed states.
export function Notice({ children, height = 120 }: { children: ReactNode; height?: number }) {
  return (
    <div className="note" style={{ minHeight: height }}>
      <p className="ser" style={{ fontSize: 20, fontStyle: 'italic', textWrap: 'balance' }}>{children}</p>
    </div>
  );
}

export function ErrorNotice({ height = 120 }: { height?: number }) {
  const { t } = useT();
  return (
    <div className="note" role="alert" style={{ minHeight: height }}>
      <p className="ser" style={{ fontSize: 20, fontStyle: 'italic' }}>{t('common.error')}</p>
      <button className="btn" onClick={() => window.location.reload()}>{t('common.retry')}</button>
    </div>
  );
}

// Section heading inside a panel.
export function PanelTitle({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <h2 className="ser" style={{ margin: 0, fontSize: size, fontWeight: 500 }}>
      {children}
    </h2>
  );
}
