import {
  STORAGE_NETFLIX_BILINGUAL_CAPTION,
  STORAGE_SHOW_NETFLIX_CAPTION_TOGGLE,
  STORAGE_SHOW_TOGGLE,
  STORAGE_SHOW_TWITCH_CAPTION_TOGGLE,
  STORAGE_SPEECH_RECOGNITION_CONSENT,
  STORAGE_TWITCH_CAPTION_SOURCE,
  STORAGE_TWITCH_CHROME_TRANSLATION,
  STORAGE_TWITCH_CHANNEL_LANGUAGE,
  STORAGE_SHOW_YOUTUBE_BILINGUAL_CAPTION,
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  STORAGE_THEME,
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  STORAGE_TOGGLE_Y_POSITION,
  STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE,
  STORAGE_YOUTUBE_AUTO_ACTIVATE,
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
  STORAGE_YOUTUBE_CHANNEL_LANGUAGE,
} from '@/config/constants';
import type { Language } from '@/hooks/language';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { useAtom, useAtomValue } from 'jotai';

export type Theme = 'light' | 'dark';

export const defaultTheme: Theme = 'light';
export const defaultShowToggle = true;
export const defaultToggleYPosition = -18;
export const defaultShowYoutubeCaptionToggle = true;
export const defaultShowTwitchCaptionToggle = true;
export const defaultShowNetflixCaptionToggle = true;
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

export const twitchShowCaptionToggleAtom = atomWithChromeStorage<boolean>(
  STORAGE_SHOW_TWITCH_CAPTION_TOGGLE,
  defaultShowTwitchCaptionToggle
);

export const netflixShowCaptionToggleAtom = atomWithChromeStorage<boolean>(
  STORAGE_SHOW_NETFLIX_CAPTION_TOGGLE,
  defaultShowNetflixCaptionToggle
);

// Netflix's own, and on by default: Netflix already shows one language, so the point there is two.
export const netflixBilingualCaptionAtom = atomWithChromeStorage<boolean>(STORAGE_NETFLIX_BILINGUAL_CAPTION, true);

// 'auto' picks the streamer's captions, then Stream Closed Captioner, then speech recognition.
export type TwitchCaptionSourceMode = 'auto' | 'cea608' | 'scc' | 'stt';

export const twitchCaptionSourceAtom = atomWithChromeStorage<TwitchCaptionSourceMode>(
  STORAGE_TWITCH_CAPTION_SOURCE,
  'auto'
);

// Spoken language per Twitch channel login, only for channels where the viewer changed it.
export const twitchChannelLanguageAtom = atomWithChromeStorage<Record<string, string>>(
  STORAGE_TWITCH_CHANNEL_LANGUAGE,
  {}
);

// Spoken language per YouTube channel ID, only for channels where the viewer changed it.
export const youtubeChannelLanguageAtom = atomWithChromeStorage<Record<string, string>>(
  STORAGE_YOUTUBE_CHANNEL_LANGUAGE,
  {}
);

// Twitch captions (and YouTube's live captions) are translated by Chrome's on-device translator;
// off, by the chosen LLM.
export const twitchChromeTranslationAtom = atomWithChromeStorage<boolean>(STORAGE_TWITCH_CHROME_TRANSLATION, true);

// The viewer agreed that speech recognition may send the tab's audio to Google.
export const speechRecognitionConsentAtom = atomWithChromeStorage<boolean>(
  STORAGE_SPEECH_RECOGNITION_CONSENT,
  false
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

// Turns captions on by itself on videos spoken in this language, or in any language but the target
// language ('other').
export type YoutubeAutoActivate = 'off' | 'other' | Language;

export const youtubeAutoActivateAtom = atomWithChromeStorage<YoutubeAutoActivate>(
  STORAGE_YOUTUBE_AUTO_ACTIVATE,
  'off'
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
export const useShowTwitchCaptionToggle = () => useAtom(twitchShowCaptionToggleAtom);
export const useShowTwitchCaptionToggleValue = () => useAtomValue(twitchShowCaptionToggleAtom);
export const useShowNetflixCaptionToggle = () => useAtom(netflixShowCaptionToggleAtom);
export const useShowNetflixCaptionToggleValue = () => useAtomValue(netflixShowCaptionToggleAtom);
export const useNetflixBilingualCaption = () => useAtom(netflixBilingualCaptionAtom);
export const useTwitchCaptionSource = () => useAtom(twitchCaptionSourceAtom);
export const useTwitchChannelLanguage = () => useAtom(twitchChannelLanguageAtom);
export const useSpeechRecognitionConsent = () => useAtom(speechRecognitionConsentAtom);
export const useTwitchChromeTranslation = () => useAtom(twitchChromeTranslationAtom);
export const useYoutubeChannelLanguage = () => useAtom(youtubeChannelLanguageAtom);
export const useShowYoutubeBilingualCaption = () => useAtom(youtubeShowBilingualCaptionAtom);
export const useUseYoutubeKeyboardNavigate = () => useAtom(useYoutubeKeyboardNavigateAtom);
export const useYoutubeCaptionSizeRatio = () => useAtom(youtubeCaptionSizeRatioAtom);
export const useYoutubeAutoActivate = () => useAtom(youtubeAutoActivateAtom);
export const useToggleHiddenSiteList = () => useAtom(toggleHiddenSiteListAtom);
