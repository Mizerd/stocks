import { useId, useState, type FormEvent } from 'react';
import { findInstrument, shortSymbol } from '../../../shared/catalog';
import type { Listing } from '../../../shared/types';
import { useT } from '../../i18n';
import { isDate, NOTE_MAX, parseDecimal, type ListEntry } from '../../lib/myList';
import { useListings } from '../../lib/universe';
import { StockPicker } from './StockPicker';

interface Props {
  // The entry being edited; leave out to add a new stock.
  entry?: ListEntry;
  // Symbols already in the list.
  taken: string[];
  onSave(entry: ListEntry): void;
  onCancel(): void;
}

type Errors = Partial<Record<'stock' | 'quantity' | 'buyPrice' | 'buyDate', string>>;

const today = () => new Date().toLocaleDateString('en-CA');

// Add or edit one stock of the list. Quantity and buy price are optional, but go together.
export function EntryForm({ entry, taken, onSave, onCancel }: Props) {
  const { t } = useT();
  const id = useId();
  const listings = useListings();
  const [picked, setPicked] = useState<Listing | undefined>();
  // An edited entry's stock may only be known once the universe has loaded.
  const inst = picked ?? (entry && findInstrument(entry.symbol, listings ?? []));
  const [quantity, setQuantity] = useState(entry?.quantity?.toString() ?? '');
  const [buyPrice, setBuyPrice] = useState(entry?.buyPrice?.toString() ?? '');
  const [buyDate, setBuyDate] = useState(entry?.buyDate ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [errors, setErrors] = useState<Errors>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const qty = quantity.trim() ? parseDecimal(quantity) : undefined;
    const price = buyPrice.trim() ? parseDecimal(buyPrice) : undefined;
    if (!inst) found.stock = t('portfolio.eStock');
    if (qty === null || qty === 0) found.quantity = t('portfolio.eNum');
    if (price === null || price === 0) found.buyPrice = t('portfolio.eNum');
    if (!found.quantity && !found.buyPrice && (qty == null) !== (price == null)) {
      found[qty == null ? 'quantity' : 'buyPrice'] = t('portfolio.eBoth');
    }
    if (buyDate && (!isDate(buyDate) || buyDate > today())) found.buyDate = t('portfolio.eDate');
    setErrors(found);
    if (!inst || Object.keys(found).length > 0) return;

    const saved: ListEntry = { symbol: inst.symbol };
    if (qty && price) {
      saved.quantity = qty;
      saved.buyPrice = price;
    }
    if (buyDate) saved.buyDate = buyDate;
    if (note.trim()) saved.note = note.trim();
    onSave(saved);
  }

  function error(field: keyof Errors) {
    return errors[field] && <p id={`${id}-${field}-err`} className="ef-err" role="alert">{errors[field]}</p>;
  }
  const describedBy = (field: keyof Errors) => (errors[field] ? `${id}-${field}-err` : undefined);
  const optional = <span className="ef-opt">{t('portfolio.optional')}</span>;

  return (
    <form className="ef" noValidate onSubmit={submit}>
      <div className="ef-f ef-stock">
        {inst ? (
          <>
            <span className="lbl">{t('portfolio.fStock')}</span>
            <p className="ef-picked">
              <span className="num" style={{ fontWeight: 600 }}>{shortSymbol(inst.symbol)}</span>
              <span className="clip">{inst.name}</span>
              {!entry && <button type="button" className="link ef-change" onClick={() => setPicked(undefined)}>{t('portfolio.change')}</button>}
            </p>
          </>
        ) : (
          <>
            <label className="lbl" htmlFor={`${id}-stock`}>{t('portfolio.fStock')}</label>
            <StockPicker id={`${id}-stock`} exclude={taken} invalid={!!errors.stock} describedBy={describedBy('stock')} onPick={setPicked} />
          </>
        )}
        {error('stock')}
      </div>
      <div className="ef-f">
        <label className="lbl" htmlFor={`${id}-qty`}>{t('portfolio.fQty')} {optional}</label>
        <input
          id={`${id}-qty`} className="fld num" type="text" inputMode="decimal" autoComplete="off"
          value={quantity} aria-invalid={!!errors.quantity} aria-describedby={describedBy('quantity')}
          onChange={(e) => setQuantity(e.target.value)}
        />
        {error('quantity')}
      </div>
      <div className="ef-f">
        <label className="lbl" htmlFor={`${id}-price`}>{t('portfolio.fPrice')}{inst && `, ${inst.currency}`} {optional}</label>
        <input
          id={`${id}-price`} className="fld num" type="text" inputMode="decimal" autoComplete="off"
          value={buyPrice} aria-invalid={!!errors.buyPrice} aria-describedby={describedBy('buyPrice')}
          onChange={(e) => setBuyPrice(e.target.value)}
        />
        {error('buyPrice')}
      </div>
      <div className="ef-f">
        <label className="lbl" htmlFor={`${id}-date`}>{t('portfolio.fDate')} {optional}</label>
        <input
          id={`${id}-date`} className="fld num" type="date" max={today()}
          value={buyDate} aria-invalid={!!errors.buyDate} aria-describedby={describedBy('buyDate')}
          onChange={(e) => setBuyDate(e.target.value)}
        />
        {error('buyDate')}
      </div>
      <div className="ef-f ef-note">
        <label className="lbl" htmlFor={`${id}-note`}>{t('portfolio.fNote')} {optional}</label>
        <input id={`${id}-note`} className="fld" type="text" maxLength={NOTE_MAX} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="ef-btns">
        <button type="submit" className="btn pri">{t(entry ? 'portfolio.save' : 'portfolio.addBtn')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}
