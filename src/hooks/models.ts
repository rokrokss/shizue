import { STORAGE_MODELS } from '@/config/constants';
import { ChatModel, TranslateModel } from '@/lib/models';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Models = {
  chatModel: ChatModel;
  translateModel: TranslateModel;
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
