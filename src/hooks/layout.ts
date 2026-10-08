import {
  STORAGE_SHOW_TOGGLE,
  STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION,
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  STORAGE_THEME,
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  STORAGE_TOGGLE_Y_POSITION,
  STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE,
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
} from '@/config/constants';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { useAtom, useAtomValue } from 'jotai';

export type Theme = 'light' | 'dark';

export const defaultTheme: Theme = 'light';
export const defaultShowToggle = true;
export const defaultToggleYPosition = -18;
export const defaultShowYoutubeCaptionToggle = true;
export const defaultShowYoutubeBilingualCaption = false;
export const defaultUseYoutubeKeyboardNavigate = true;
export const defaultCaptionSizeRatio = 1.0;
export const defaultToggleHiddenSiteList: string[] = [];

export const themeAtom = atomWithChromeStorage<Theme>(
  STORAGE_THEME,
  defaultTheme
);

export const showToggleAtom = atomWithChromeStorage<boolean>(
  STORAGE_SHOW_TOGGLE,
  defaultShowToggle
);

export const toggleYPositionAtom = atomWithChromeStorage<number>(
  STORAGE_TOGGLE_Y_POSITION,
  defaultToggleYPosition
);

export const youtubeShowCaptionToggleAtom = atomWithChromeStorage<boolean>(
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  defaultShowYoutubeCaptionToggle
);

export const youtubeShowBilingualCaptionAtom = atomWithChromeStorage<boolean>(
  STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION,
  defaultShowYoutubeBilingualCaption
);

export const useYoutubeKeyboardNavigateAtom = atomWithChromeStorage<boolean>(
  STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE,
  defaultUseYoutubeKeyboardNavigate
);

export const youtubeCaptionSizeRatioAtom = atomWithChromeStorage<number>(
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
  defaultCaptionSizeRatio
);

export const toggleHiddenSiteListAtom = atomWithChromeStorage<string[]>(
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  defaultToggleHiddenSiteList
);

export const useTheme = () => useAtom(themeAtom);
export const useThemeValue = () => useAtomValue(themeAtom);
export const useShowToggle = () => useAtom(showToggleAtom);
export const useShowToggleValue = () => useAtomValue(showToggleAtom);
export const useToggleYPosition = () => useAtom(toggleYPositionAtom);
export const useShowYoutubeCaptionToggle = () => useAtom(youtubeShowCaptionToggleAtom);
export const useShowYoutubeCaptionToggleValue = () => useAtomValue(youtubeShowCaptionToggleAtom);
export const useShowYoutubeBilingualCaption = () => useAtom(youtubeShowBilingualCaptionAtom);
export const useUseYoutubeKeyboardNavigate = () => useAtom(useYoutubeKeyboardNavigateAtom);
export const useYoutubeCaptionSizeRatio = () => useAtom(youtubeCaptionSizeRatioAtom);
export const useToggleHiddenSiteList = () => useAtom(toggleHiddenSiteListAtom);
