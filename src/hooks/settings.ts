import { STORAGE_OPENAI_KEY } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const defaultOpenAIKey = '';

export const openAIKeyAtom = atomWithStorage<string>(
  STORAGE_OPENAI_KEY,
  defaultOpenAIKey,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useOpenAIKey = () => useAtom(openAIKeyAtom);
export const useOpenAIKeyValue = () => useAtomValue(openAIKeyAtom);
export const useSetOpenAIKey = () => useSetAtom(openAIKeyAtom);
