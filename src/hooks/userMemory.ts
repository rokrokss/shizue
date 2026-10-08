import { STORAGE_USER_MEMORY } from '@/config/constants';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { useAtom } from 'jotai';

const KEY = 'USER_MEMORY';
const area = 'local';

export type UserMemory = {
  text?: string;
};

export const defaultUserMemory: UserMemory = {
  text: '',
};

export const userMemoryAtom = atomWithChromeStorage<UserMemory>(
  STORAGE_USER_MEMORY,
  defaultUserMemory
);

export const useUserMemory = () => useAtom(userMemoryAtom);

export const loadUserMemory = async () =>
  (await chrome.storage[area].get(KEY))[KEY] || defaultUserMemory;
