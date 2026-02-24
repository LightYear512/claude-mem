import type { Locale, TranslationDict } from './types';
import { en } from './en';
import { zhCN } from './zh-CN';

export type { Locale, TranslationDict };

const translations: Record<Locale, TranslationDict> = {
  'en': en,
  'zh-CN': zhCN,
};

export function detectLocale(): Locale {
  // Check localStorage first
  const stored = localStorage.getItem('claude-mem-locale');
  if (stored && (stored === 'en' || stored === 'zh-CN')) {
    return stored as Locale;
  }

  // Auto-detect from browser
  const lang = navigator.language || '';
  if (lang.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en';
}

export function getTranslations(locale: Locale): TranslationDict {
  return translations[locale] || translations['en'];
}
