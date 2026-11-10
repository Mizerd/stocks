import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from './config/brand';

type Theme = 'light' | 'dark';

interface Settings {
  lang: Lang;
  theme: Theme;
  colorBlind: boolean;
  setLang(lang: Lang): void;
  toggleTheme(): void;
  toggleColorBlind(): void;
}

const SettingsContext = createContext<Settings | null>(null);

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice simply lasts for this visit.
  }
}

function initialLang(): Lang {
  const saved = stored('lang');
  if (saved === 'lt' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('lt') ? 'lt' : 'en';
}

function initialTheme(): Theme {
  const saved = stored('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [colorBlind, setColorBlind] = useState(() => stored('colorBlind') === '1');

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value: Settings = {
    lang,
    theme,
    colorBlind,
    setLang(next) {
      store('lang', next);
      setLangState(next);
    },
    toggleTheme() {
      const next = theme === 'dark' ? 'light' : 'dark';
      store('theme', next);
      setTheme(next);
    },
    toggleColorBlind() {
      store('colorBlind', colorBlind ? '0' : '1');
      setColorBlind(!colorBlind);
    },
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings must be used inside SettingsProvider');
  return settings;
}
