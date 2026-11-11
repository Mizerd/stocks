import { useState } from 'react';
import { shortSymbol } from '../../shared/catalog';
import { useT } from '../i18n';
import { useMyList } from '../lib/myList';
import { hasPosition } from '../lib/portfolio';
import { ConfirmBar } from './ConfirmBar';

// Stock page toggle: watch this stock in the personal list, or take it out again.
export function AddToList({ symbol }: { symbol: string }) {
  const { t } = useT();
  const { entries, add, remove } = useMyList();
  const [asking, setAsking] = useState(false);
  const entry = entries.find((e) => e.symbol === symbol);

  function toggle() {
    if (!entry) add({ symbol });
    else if (hasPosition(entry)) setAsking(true);
    else remove(symbol);
  }

  if (asking && entry) {
    return (
      <ConfirmBar
        question={t('portfolio.rmAsk', { symbol: shortSymbol(symbol) })}
        confirmLabel={t('portfolio.rmYes')}
        onConfirm={() => {
          remove(symbol);
          setAsking(false);
        }}
        onCancel={() => setAsking(false)}
      />
    );
  }

  return (
    <button type="button" className="btn" aria-pressed={!!entry} onClick={toggle}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d={entry ? 'M2 7.5l3.2 3.2L12 3.8' : 'M7 2v10M2 7h10'} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      </svg>
      {t(entry ? 'portfolio.inList' : 'portfolio.addToList')}
    </button>
  );
}
