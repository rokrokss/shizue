// atoms/language.ts
import { chromeStorageBackend } from '@/lib/storageBackend';
import { atomWithStorage } from 'jotai/utils';

export type Language = 'en' | 'ko';

const fallbackLanguage: Language = (() => {
  const lang = navigator.language;
  return lang.startsWith('ko') ? 'ko' : 'en';
})();

export const languageAtom = atomWithStorage<Language>(
  'LANGUAGE',
  fallbackLanguage,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
