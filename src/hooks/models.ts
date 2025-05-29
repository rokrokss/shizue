import { STORAGE_MODELS } from '@/config/constants';
import { chromeStorageBackend } from '@/utils/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type ChatModel = 'gpt-4.1' | 'gpt-4.1-mini';
export type TranslateModel = 'gpt-4.1' | 'gpt-4.1-mini';


export type Models = {
  chatModel?: ChatModel;
  translateModel?: TranslateModel;
};

export const defaultModels: Models = {
  chatModel: 'gpt-4.1',
  translateModel: 'gpt-4.1',
};

export const modelsAtom = atomWithStorage<Models>(
  STORAGE_MODELS,
  defaultModels,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useModels = () => useAtom(modelsAtom);
