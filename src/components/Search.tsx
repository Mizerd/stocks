import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { INDICES, shortSymbol, STOCKS } from '../../shared/catalog';
import { EXCHANGES } from '../../shared/exchanges';
import type { Instrument } from '../../shared/types';
import { useT } from '../i18n';

const ALL = [...STOCKS, ...INDICES];

export function searchInstruments(query: string): Instrument[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = ALL.filter((i) => i.symbol.toLowerCase().startsWith(q) || i.name.toLowerCase().startsWith(q));
  const contains = ALL.filter((i) => !starts.includes(i) && `${i.symbol} ${i.name}`.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, 8);
}

export function Search() {
  const { t } = useT();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = searchInstruments(query);

  // "/" jumps to the search field from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(inst: Instrument) {
    setQuery('');
    setOpen(false);
    input.current?.blur();
    navigate(`/stock/${inst.symbol}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((active + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((active - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter' && results[active]) {
      go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  }

  return (
    <label
      className="srch"
      style={{
        flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 12px',
        border: '1px solid var(--ink)', borderRadius: 2, background: 'var(--card)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: '0 0 auto' }}>
        <circle cx="7" cy="7" r="4.75" style={{ fill: 'none', stroke: 'var(--ink2)', strokeWidth: 1.5 }} />
        <path d="M10.6 10.6L14 14" style={{ stroke: 'var(--ink2)', strokeWidth: 1.5, strokeLinecap: 'round' }} />
      </svg>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && query !== ''}
        aria-controls="search-results"
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={t('common.search')}
        aria-label={t('common.search')}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        style={{ flex: '1 1 0%', minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 14 }}
      />
      <span
        className="num"
        aria-hidden="true"
        style={{ fontSize: 11, color: 'var(--ink3)', border: '1px solid var(--hair)', borderRadius: 2, padding: '1px 6px' }}
      >
        /
      </span>
      {open && query.trim() !== '' && (
        // Keep focus in the input when a result is pressed, so the click still lands.
        <ul id="search-results" className="srch-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {results.length === 0 && <li><p style={{ display: 'block', color: 'var(--ink2)' }}>{t('common.noResults', { q: query.trim() })}</p></li>}
          {results.map((inst, i) => (
            <li key={inst.symbol} role="option" aria-selected={i === active}>
              <Link to={`/stock/${inst.symbol}`} className={i === active ? 'on' : ''} tabIndex={-1} onClick={() => go(inst)}>
                <span className="num" style={{ fontWeight: 500 }}>{shortSymbol(inst.symbol)}</span>
                <span className="clip">{inst.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  {inst.kind === 'index' ? t('common.index') : EXCHANGES[inst.exchange].short}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
