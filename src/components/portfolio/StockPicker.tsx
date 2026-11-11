import { useState } from 'react';
import { shortSymbol } from '../../../shared/catalog';
import { EXCHANGES } from '../../../shared/exchanges';
import type { Instrument } from '../../../shared/types';
import { useT } from '../../i18n';
import { searchInstruments } from '../Search';

interface Props {
  id: string;
  // Symbols already in the list; they are not offered again.
  exclude: string[];
  invalid: boolean;
  describedBy?: string;
  onPick(inst: Instrument): void;
}

// Search field over the catalogue's stocks. The suggestions stay open until one is chosen,
// so a tap on a suggestion cannot be lost to the field losing focus.
export function StockPicker({ id, exclude, invalid, describedBy, onPick }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchInstruments(query).filter((i) => i.kind === 'stock' && !exclude.includes(i.symbol));
  const open = query.trim() !== '';

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) onPick(results[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  return (
    <div className="pick">
      <input
        id={id}
        className="fld"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        autoFocus
        value={query}
        placeholder={t('portfolio.fStockPh')}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={`${id}-list`} className="srch-list pick-list" role="listbox">
          {results.length === 0 && <li><p style={{ display: 'block', color: 'var(--ink2)' }}>{t('common.noResults', { q: query.trim() })}</p></li>}
          {results.map((inst, i) => (
            <li key={inst.symbol} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} tabIndex={-1} onClick={() => onPick(inst)}>
                <span className="num" style={{ fontWeight: 600 }}>{shortSymbol(inst.symbol)}</span>
                <span className="clip">{inst.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{EXCHANGES[inst.exchange].short}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
