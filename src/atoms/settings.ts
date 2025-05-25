import { chromeStorageBackend } from '@/lib/storageBackend';
import { atomWithStorage } from 'jotai/utils';

export type Settings = {
  theme: 'light' | 'dark' | 'system';
  openAIKey?: string;
  model?: string;
};

export const defaultSettings: Settings = {
  theme: 'system',
};

export const settingsAtom = atomWithStorage<Settings>(
  'SETTINGS',
  defaultSettings,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
