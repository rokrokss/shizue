import { STORAGE_SETTINGS } from '@/config/constants';
import { chromeStorageBackend } from '@/utils/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Settings = {
  theme: 'light' | 'dark' | 'system';
  openAIKey?: string;
};

export const defaultSettings: Settings = {
  theme: 'system',
};

export const settingsAtom = atomWithStorage<Settings>(
  STORAGE_SETTINGS,
  defaultSettings,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useSettings = () => useAtom(settingsAtom);
