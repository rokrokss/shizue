import { chromeStorageBackend } from '@/utils/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const KEY = 'USER_MEMORY';
const area = 'local';

export type UserMemory = {
  text?: string;
};

export const defaultUserMemory: UserMemory = {
  text: '',
};

export const userMemoryAtom = atomWithStorage<UserMemory>(
  'USER_MEMORY',
  defaultUserMemory,
  chromeStorageBackend(area),
  { getOnInit: true }
);

export const useUserMemory = () => useAtom(userMemoryAtom);

export const loadUserMemory = async () =>
  (await chrome.storage[area].get(KEY))[KEY] || defaultUserMemory;
