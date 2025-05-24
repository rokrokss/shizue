import { chromeStorageBackend } from '@/lib/storageBackend';
import { atom } from 'jotai';
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

export const isOnboardedAtom = atom((get) => {
  const settings = get(settingsAtom) as Settings;
  return !!settings.openAIKey;
});
