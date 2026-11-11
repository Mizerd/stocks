import { useRef, useState, type ChangeEvent } from 'react';
import { useT } from '../../i18n';
import { parseList, serializeList, type ListEntry } from '../../lib/myList';
import { ConfirmBar } from '../ConfirmBar';

interface Props {
  entries: ListEntry[];
  onImport(entries: ListEntry[]): void;
  onClear(): void;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Export the list to a file, import one back, or delete the list from this browser.
export function ListTools({ entries, onImport, onClear }: Props) {
  const { t } = useT();
  const file = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const parsed = parseList(await picked.text());
    if (parsed.entries.length === 0 && parsed.skipped === 0) {
      setMessage(t('portfolio.importBad'));
      return;
    }
    if (parsed.entries.length > 0) onImport(parsed.entries);
    setMessage(t('portfolio.imported', { n: parsed.entries.length, m: parsed.skipped }));
  }

  return (
    <div className="lt" role="group" aria-label={t('portfolio.tools')}>
      {asking ? (
        <ConfirmBar
          question={t('portfolio.delAsk', { n: entries.length })}
          confirmLabel={t('portfolio.delYes')}
          onConfirm={() => {
            onClear();
            setAsking(false);
            setMessage(t('portfolio.deleted'));
          }}
          onCancel={() => setAsking(false)}
        />
      ) : (
        <>
          <button type="button" className="btn" onClick={() => file.current?.click()}>{t('portfolio.import')}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={importFile} />
          {entries.length > 0 && (
            <>
              <button type="button" className="btn" onClick={() => download('my-list.json', serializeList(entries))}>{t('portfolio.export')}</button>
              <button type="button" className="btn" onClick={() => setAsking(true)}>{t('portfolio.del')}</button>
            </>
          )}
        </>
      )}
      <p className="lt-msg" role="status">{message}</p>
    </div>
  );
}
