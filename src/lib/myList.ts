import { useSyncExternalStore } from 'react';
import { findInstrument, isSymbolShaped } from '../../shared/catalog';
import type { Listing } from '../../shared/types';

// The visitor's personal list. It lives only in this browser's localStorage and is written
// only when the visitor adds, edits, imports or removes something.

export interface ListEntry {
  symbol: string;
  quantity?: number;
  buyPrice?: number;
  // YYYY-MM-DD
  buyDate?: string;
  note?: string;
}

export type SortKey = 'value' | 'gain' | 'gainPct' | 'day' | 'symbol';

export const LIST_KEY = 'myList.v1';
export const SORT_KEY = 'myListSort';
export const SORT_KEYS: SortKey[] = ['value', 'gain', 'gainPct', 'day', 'symbol'];
export const NOTE_MAX = 200;
const VERSION = 1;

// Everything the site keeps in localStorage, for "Delete my data from this browser".
const ALL_KEYS = ['lang', 'theme', 'colorBlind', 'lastStock', LIST_KEY, SORT_KEY];

// Reads "1.5", "1,5", "1 234,56" and "1,234.56". Returns null for anything else.
export function parseDecimal(text: string): number | null {
  let s = text.replace(/[\s  ]/g, '');
  if (s.includes(',') && s.includes('.')) {
    const thousands = s.lastIndexOf(',') > s.lastIndexOf('.') ? '.' : ',';
    s = s.replaceAll(thousands, '');
  }
  s = s.replace(',', '.');
  return /^\d+(\.\d+)?$|^\.\d+$/.test(s) ? Number(s) : null;
}

const positive = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// The stock's current symbol, checked against the universe when it is given. Without it (the saved
// list is read before the universe loads) any well-formed symbol is kept, so nothing saved is lost.
function entrySymbol(symbol: unknown, universe: readonly Listing[] | null): string | null {
  if (typeof symbol !== 'string') return null;
  const inst = findInstrument(symbol, universe ?? []);
  if (inst) return inst.kind === 'stock' ? inst.symbol : null;
  const upper = symbol.trim().toUpperCase();
  return universe === null && isSymbolShaped(upper) ? upper : null;
}

// One stored or imported item as a valid entry, or null if it is not a covered stock.
// Bad numbers, dates and notes are dropped; the stock itself is kept.
export function cleanEntry(raw: unknown, universe: readonly Listing[] | null = null): ListEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const symbol = entrySymbol(item.symbol, universe);
  if (!symbol) return null;
  const entry: ListEntry = { symbol };
  const quantity = positive(item.quantity);
  const buyPrice = positive(item.buyPrice);
  if (quantity) entry.quantity = quantity;
  if (buyPrice) entry.buyPrice = buyPrice;
  if (isDate(item.buyDate)) entry.buyDate = item.buyDate;
  if (typeof item.note === 'string' && item.note.trim()) entry.note = item.note.trim().slice(0, NOTE_MAX);
  return entry;
}

export interface ParsedList {
  entries: ListEntry[];
  skipped: number;
}

// Parses a stored or exported list. Corrupt text, other versions and unknown stocks are ignored;
// a stock listed twice keeps its first entry.
export function parseList(text: string | null, universe: readonly Listing[] | null = null): ParsedList {
  let data: unknown;
  try {
    data = JSON.parse(text ?? '');
  } catch {
    return { entries: [], skipped: 0 };
  }
  const file = data as { version?: unknown; entries?: unknown } | null;
  if (file?.version !== VERSION || !Array.isArray(file.entries)) return { entries: [], skipped: 0 };
  const entries: ListEntry[] = [];
  for (const raw of file.entries) {
    const entry = cleanEntry(raw, universe);
    if (entry && !entries.some((e) => e.symbol === entry.symbol)) entries.push(entry);
  }
  return { entries, skipped: file.entries.length - entries.length };
}

export function serializeList(entries: ListEntry[]): string {
  return JSON.stringify({ version: VERSION, entries });
}

// Adds an entry, or replaces the one for the same stock.
export function upsert(entries: ListEntry[], entry: ListEntry): ListEntry[] {
  const exists = entries.some((e) => e.symbol === entry.symbol);
  return exists ? entries.map((e) => (e.symbol === entry.symbol ? entry : e)) : [...entries, entry];
}

function read(): ListEntry[] {
  try {
    return parseList(localStorage.getItem(LIST_KEY)).entries;
  } catch {
    return [];
  }
}

let entries = read();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function save(next: ListEntry[]) {
  entries = next;
  try {
    if (next.length) localStorage.setItem(LIST_KEY, serializeList(next));
    else localStorage.removeItem(LIST_KEY);
  } catch {
    // Storage can be blocked (private mode); the list then lasts for this visit.
  }
  notify();
}

// Another tab changed or deleted the list.
function onStorage(e: StorageEvent) {
  if (e.key !== LIST_KEY && e.key !== null) return;
  entries = read();
  notify();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

const actions = {
  add: (entry: ListEntry) => save(upsert(entries, entry)),
  remove: (symbol: string) => save(entries.filter((e) => e.symbol !== symbol)),
  clear: () => save([]),
  // Imported entries replace the ones for the same stock and keep the rest.
  importEntries: (imported: ListEntry[]) => save(imported.reduce(upsert, entries)),
};

export function useMyList() {
  return { entries: useSyncExternalStore(subscribe, () => entries), ...actions };
}

export function storedSort(): SortKey {
  try {
    const saved = localStorage.getItem(SORT_KEY) as SortKey | null;
    return saved && SORT_KEYS.includes(saved) ? saved : 'value';
  } catch {
    return 'value';
  }
}

export function storeSort(key: SortKey) {
  try {
    localStorage.setItem(SORT_KEY, key);
  } catch {
    // The order then lasts for this visit.
  }
}

// Removes the list and every remembered choice (language, theme, palette, last stock, sort order).
export function deleteBrowserData() {
  try {
    for (const key of ALL_KEYS) localStorage.removeItem(key);
    sessionStorage.removeItem('lastStock');
  } catch {
    // Nothing could be stored in the first place.
  }
  entries = [];
  notify();
}
