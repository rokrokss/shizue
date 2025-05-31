import { STORAGE_LAYOUT } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Layout = {
  toggleYPosition: number;
  showToggle: boolean;
};

export const defaultLayout: Layout = {
  toggleYPosition: 0,
  showToggle: true,
};

export const layoutAtom = atomWithStorage<Layout>(
  STORAGE_LAYOUT,
  defaultLayout,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useLayout = () => useAtom(layoutAtom);
