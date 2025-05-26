import { chromeStorageBackend } from '@/utils/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Models = {
  chatModel?: string;
};

export const defaultModels: Models = {
  chatModel: 'chatgpt-4o-latest',
};

export const modelsAtom = atomWithStorage<Models>(
  'MODELS',
  defaultModels,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useModels = () => useAtom(modelsAtom);
