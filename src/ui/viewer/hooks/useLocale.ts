import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Locale, TranslationDict } from '../locale';
import { detectLocale, getTranslations } from '../locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('claude-mem-locale', newLocale);
  }, []);

  const dict = useMemo(() => getTranslations(locale), [locale]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let value = dict[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  }, [dict]);

  const contextValue = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return React.createElement(LocaleContext.Provider, { value: contextValue }, children);
}
