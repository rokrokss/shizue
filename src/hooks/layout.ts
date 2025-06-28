import {
  STORAGE_SHOW_TOGGLE,
  STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION,
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  STORAGE_THEME,
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  STORAGE_TOGGLE_Y_POSITION,
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
} from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Theme = 'light' | 'dark';

export const defaultTheme: Theme = 'light';
export const defaultShowToggle = true;
export const defaultToggleYPosition = -18;
export const defaultShowYoutubeCaptionToggle = true;
export const defaultShowYoutubeBilingualCaption = false;
export const defaultCaptionSizeRatio = 1.0;
export const defaultToggleHiddenSiteList: string[] = [];

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

export const youtubeShowCaptionToggleAtom = atomWithStorage<boolean>(
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  defaultShowYoutubeCaptionToggle,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const youtubeShowBilingualCaptionAtom = atomWithStorage<boolean>(
  STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION,
  defaultShowYoutubeBilingualCaption,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const youtubeCaptionSizeRatioAtom = atomWithStorage<number>(
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
  defaultCaptionSizeRatio,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const toggleHiddenSiteListAtom = atomWithStorage<string[]>(
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  defaultToggleHiddenSiteList,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useTheme = () => useAtom(themeAtom);
export const useThemeValue = () => useAtomValue(themeAtom);
export const useShowToggle = () => useAtom(showToggleAtom);
export const useShowToggleValue = () => useAtomValue(showToggleAtom);
export const useToggleYPosition = () => useAtom(toggleYPositionAtom);
export const useShowYoutubeCaptionToggle = () => useAtom(youtubeShowCaptionToggleAtom);
export const useShowYoutubeCaptionToggleValue = () => useAtomValue(youtubeShowCaptionToggleAtom);
export const useShowYoutubeBilingualCaption = () => useAtom(youtubeShowBilingualCaptionAtom);
export const useYoutubeCaptionSizeRatio = () => useAtom(youtubeCaptionSizeRatioAtom);
export const useToggleHiddenSiteList = () => useAtom(toggleHiddenSiteListAtom);
