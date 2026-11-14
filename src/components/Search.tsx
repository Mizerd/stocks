import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { INDICES, shortSymbol, STOCKS } from '../../shared/catalog';
import { EXCHANGES } from '../../shared/exchanges';
import type { Listing } from '../../shared/types';
import { useT } from '../i18n';
import { direction, useFormat } from '../lib/format';
import { fundSummary, loadedFunds, withoutCompany } from '../lib/funds';
import { prefetchProps } from '../lib/prefetch';
import { loadedStocks, useListings } from '../lib/universe';

// What a search result is: an index, a fund's company and ISIN, or a stock's exchange.
export function placeOf(inst: Listing, t: (key: string) => string): string {
  if (inst.kind === 'index') return t('common.index');
  if (inst.kind === 'fund') return [inst.company, shortSymbol(inst.symbol)].filter(Boolean).join(' · ');
  return EXCHANGES[inst.exchange].short;
}

// The first column of a result: the ticker, or "Fund" for a fund, whose ISIN is too long for it.
export function symbolLabel(inst: Listing, t: (key: string) => string): string {
  return inst.kind === 'fund' ? t('common.fund') : shortSymbol(inst.symbol);
}

// Until the universe has loaded, the catalogue is searched.
export function useSearchable(): Listing[] {
  const universe = useListings();
  return useMemo(() => (universe && universe.length > 0 ? [...INDICES, ...universe] : [...STOCKS, ...INDICES]), [universe]);
}

// Symbol or name starting with the query first, then containing it. A fund is also found by its ISIN and company.
export function searchInstruments(query: string, all: readonly Listing[]): Listing[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: Listing[] = [];
  const contains: Listing[] = [];
  for (const i of all) {
    const symbol = i.symbol.toLowerCase();
    const name = i.name.toLowerCase();
    const isin = i.kind === 'fund' ? shortSymbol(symbol) : '';
    if (symbol.startsWith(q) || name.startsWith(q) || (isin && isin.startsWith(q))) starts.push(i);
    else if (symbol.includes(q) || name.includes(q) || (i.company ?? '').toLowerCase().includes(q)) contains.push(i);
  }
  return [...starts, ...contains].slice(0, 8);
}

// On phones the field hides behind a button until `expanded`; Escape or leaving the field folds it again.
export function Search({ expanded, onExpandedChange }: { expanded: boolean; onExpandedChange(expanded: boolean): void }) {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = searchInstruments(query, useSearchable());
  // Prices only from the quote lists already loaded for the page: nothing is fetched while typing.
  const quotes = new Map(results.length > 0 ? [...loadedStocks(), ...loadedFunds().map(fundSummary)].map((s) => [s.symbol, s]) : []);

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

  function go(inst: Listing) {
    setQuery('');
    setOpen(false);
    input.current?.blur();
    navigate(`/stock/${inst.symbol}`);
  }

  // Focused in the same tap that shows the field, or iOS does not raise the keyboard.
  function expand() {
    flushSync(() => onExpandedChange(true));
    input.current?.focus();
  }

  function close() {
    setOpen(false);
    onExpandedChange(false);
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
      input.current?.blur();
    }
  }

  return (
    <>
      <button className="icon-btn srch-btn" aria-label={t('common.searchOpen')} aria-expanded={expanded} onClick={expand}>
        <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }} />
          <path d="M10.6 10.6L14 14" style={{ stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }} />
        </svg>
      </button>
      <label className="srch">
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
          enterKeyHint="search"
          value={query}
          placeholder={t('common.search')}
          aria-label={t('common.search')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <kbd className="srch-key" aria-hidden="true">/</kbd>
        {open && query.trim() !== '' && (
          // Keep focus in the input when a result is pressed, so the click still lands.
          <ul id="search-results" className="srch-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
            {results.length === 0 && <li><p style={{ display: 'block', color: 'var(--ink2)' }}>{t('common.noResults', { q: query.trim() })}</p></li>}
            {results.map((inst, i) => {
              const quote = quotes.get(inst.symbol);
              return (
                <li key={inst.symbol} role="option" aria-selected={i === active}>
                  <Link to={`/stock/${inst.symbol}`} className={i === active ? 'on' : ''} tabIndex={-1} onClick={() => go(inst)} {...prefetchProps(inst.symbol)}>
                    <span className="num" style={{ fontWeight: 600 }}>{symbolLabel(inst, t)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="clip" style={{ display: 'block' }}>{inst.kind === 'fund' ? withoutCompany(inst.name, inst.company) : inst.name}</span>
                      <span className="clip" style={{ display: 'block', fontSize: 11.5, color: 'var(--ink3)' }}>
                        {placeOf(inst, t)}
                      </span>
                    </span>
                    {quote && (
                      <span className="num r" style={{ lineHeight: 1.35 }}>
                        <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{f.price(quote.price)} <span className="cur">{quote.currency}</span></span>
                        <span className={direction(quote.changePct)} style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{f.pct(quote.changePct)}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </label>
    </>
  );
}
