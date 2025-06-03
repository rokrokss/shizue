import { STORAGE_SHOW_TOGGLE, STORAGE_THEME, STORAGE_TOGGLE_Y_POSITION } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Theme = 'light' | 'dark';

export const defaultTheme: Theme = 'light';
export const defaultShowToggle = true;
export const defaultToggleYPosition = -18;

export const themeAtom = atomWithStorage<Theme>(
  STORAGE_THEME,
  defaultTheme,
  chromeStorageBackend('local'),
  { getOnInit: false }
);

export const showToggleAtom = atomWithStorage<boolean>(
  STORAGE_SHOW_TOGGLE,
  defaultShowToggle,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
export const toggleYPositionAtom = atomWithStorage<number>(
  STORAGE_TOGGLE_Y_POSITION,
  defaultToggleYPosition,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useTheme = () => useAtom(themeAtom);
export const useThemeValue = () => useAtomValue(themeAtom);
export const useShowToggle = () => useAtom(showToggleAtom);
export const useToggleYPosition = () => useAtom(toggleYPositionAtom);
