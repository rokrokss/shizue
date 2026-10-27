import { STORAGE_AUTO_MEMORY } from '@/config/constants';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { AutoMemory, defaultAutoMemory } from '@/lib/autoMemory';
import { useAtom, useAtomValue } from 'jotai';

export const autoMemoryAtom = atomWithChromeStorage<AutoMemory>(
  STORAGE_AUTO_MEMORY,
  defaultAutoMemory
);

export const useAutoMemory = () => useAtom(autoMemoryAtom);

export const useAutoMemoryValue = () => useAtomValue(autoMemoryAtom);
