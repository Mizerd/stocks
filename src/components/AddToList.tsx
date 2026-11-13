import { useState } from 'react';
import { shortSymbol } from '../../shared/catalog';
import { useT } from '../i18n';
import { useMyList } from '../lib/myList';
import type { ListEntry } from '../lib/myList';
import { hasPosition } from '../lib/portfolio';
import { ConfirmBar } from './ConfirmBar';
import { showToast, Toast } from './Toast';

// Adding and removing stocks, each followed by a toast that can take it back.
export function useListWithUndo() {
  const { t } = useT();
  const { entries, add, remove, restore } = useMyList();
  return {
    entries,
    add(entry: ListEntry) {
      add(entry);
      showToast(t('portfolio.added', { symbol: shortSymbol(entry.symbol) }), () => remove(entry.symbol));
    },
    remove(symbol: string) {
      const index = entries.findIndex((e) => e.symbol === symbol);
      if (index < 0) return;
      const removed = entries[index];
      remove(symbol);
      showToast(t('portfolio.removed', { symbol: shortSymbol(symbol) }), () => restore(removed, index));
    },
  };
}

// Stock page toggle: watch this stock in the personal list, or take it out again.
export function AddToList({ symbol }: { symbol: string }) {
  const { t } = useT();
  const { entries, add, remove } = useListWithUndo();
  const [asking, setAsking] = useState(false);
  const entry = entries.find((e) => e.symbol === symbol);

  function toggle() {
    if (!entry) add({ symbol });
    else if (hasPosition(entry)) setAsking(true);
    else remove(symbol);
  }

  return (
    <>
      {asking && entry ? (
        <ConfirmBar
          question={t('portfolio.rmAsk', { symbol: shortSymbol(symbol) })}
          confirmLabel={t('portfolio.rmYes')}
          onConfirm={() => {
            remove(symbol);
            setAsking(false);
          }}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <button type="button" className="btn" aria-pressed={!!entry} onClick={toggle}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d={entry ? 'M2 7.5l3.2 3.2L12 3.8' : 'M7 2v10M2 7h10'} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
          </svg>
          {t(entry ? 'portfolio.inList' : 'portfolio.addToList')}
        </button>
      )}
      <Toast />
    </>
  );
}
