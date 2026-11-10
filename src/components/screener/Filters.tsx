import { useState, type ReactNode } from 'react';
import { PanelTitle, Seg } from '../ui';
import { useT } from '../../i18n';
import { useFormat } from '../../lib/format';
import { CAP_MAX, DIRECTIONS, DY_MAX, PE_MIN, PE_NO_LIMIT, REGIONS, SECTORS, type Filters as FilterValues } from '../../lib/screener';

interface ChipGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T[];
  nameOf(option: T): string;
  onChange(selected: T[]): void;
}

function ChipGroup<T extends string>({ label, options, selected, nameOf, onChange }: ChipGroupProps<T>) {
  const toggle = (option: T) =>
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);

  return (
    <div role="group" aria-label={label}>
      <p className="lbl" style={{ margin: '0 0 8px' }}>{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => (
          <button
            key={option}
            className={`chip chip--solid ${selected.includes(option) ? 'on' : ''}`}
            aria-pressed={selected.includes(option)}
            onClick={() => toggle(option)}
          >
            {nameOf(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  readout: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(value: number): void;
}

function Slider({ label, readout, min, max, step, value, onChange }: SliderProps) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span className="lbl">{label}</span>
        <span className="num" style={{ fontSize: 12.5 }}>{readout}</span>
      </span>
      <input
        className="rng"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

interface FiltersProps {
  filters: FilterValues;
  onChange(patch: Partial<FilterValues>): void;
  onClear(): void;
}

export function Filters({ filters, onChange, onClear }: FiltersProps) {
  const { t, list } = useT();
  const f = useFormat();
  const directionNames = list('screener.dirs');
  // Below the sidebar breakpoint the filters fold away above the results; CSS ignores this when there is room.
  const [open, setOpen] = useState(false);

  return (
    <aside className="pnl flt" data-open={open}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PanelTitle>{t('screener.filters')}</PanelTitle>
        <button className="link" style={{ marginLeft: 'auto', minHeight: 44 }} onClick={onClear}>{t('screener.clear')}</button>
        <button className="flt-tog" aria-expanded={open} aria-controls="filters" aria-label={t('screener.filters')} onClick={() => setOpen(!open)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 6l4.5 4.5L12.5 6" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
          </svg>
        </button>
      </div>
      <div id="filters" className="flt-body" style={{ marginTop: 18 }}>
        <ChipGroup
          label={t('screener.fSec')}
          options={SECTORS}
          selected={filters.sectors}
          nameOf={(sector) => t(`screener.sec.${sector}`)}
          onChange={(sectors) => onChange({ sectors })}
        />
        <ChipGroup
          label={t('screener.fReg')}
          options={REGIONS}
          selected={filters.regions}
          nameOf={(region) => t(`screener.reg.${region}`)}
          onChange={(regions) => onChange({ regions })}
        />
        <Slider
          label={t('screener.fCap')}
          readout={filters.capMin === 0 ? t('screener.any') : `≥ ${f.big(filters.capMin * 1e9)} EUR`}
          min={0}
          max={CAP_MAX}
          step={50}
          value={filters.capMin}
          onChange={(capMin) => onChange({ capMin })}
        />
        <Slider
          label={t('screener.fPe')}
          readout={filters.peMax >= PE_NO_LIMIT ? t('screener.noLimit') : `≤ ${f.num(filters.peMax, 0)}`}
          min={PE_MIN}
          max={PE_NO_LIMIT}
          step={1}
          value={filters.peMax}
          onChange={(peMax) => onChange({ peMax })}
        />
        <Slider
          label={t('screener.fDy')}
          readout={filters.dyMin === 0 ? t('screener.any') : `≥ ${f.plainPct(filters.dyMin)}`}
          min={0}
          max={DY_MAX}
          step={0.25}
          value={filters.dyMin}
          onChange={(dyMin) => onChange({ dyMin })}
        />
        <div>
          <p className="lbl" style={{ margin: '0 0 8px' }}>{t('screener.fDir')}</p>
          <div style={{ width: 'max-content', maxWidth: '100%' }}>
            <Seg
              label={t('screener.fDir')}
              options={DIRECTIONS.map((value, i) => ({ value, label: directionNames[i] }))}
              value={filters.direction}
              onChange={(direction) => onChange({ direction })}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
