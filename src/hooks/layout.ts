import {
  STORAGE_CAPTION_DISPLAY,
  STORAGE_CAPTION_STYLE,
  STORAGE_CAPTION_WORD_HIGHLIGHT,
  STORAGE_NETFLIX_AUTO_ACTIVATE,
  STORAGE_NETFLIX_CAPTION_DISPLAY,
  STORAGE_PAGE_TRANSLATION_MODE,
  STORAGE_SHOW_NETFLIX_CAPTION_TOGGLE,
  STORAGE_SHOW_TOGGLE,
  STORAGE_SHOW_TWITCH_CAPTION_TOGGLE,
  STORAGE_SPEECH_RECOGNITION_CONSENT,
  STORAGE_TWITCH_CAPTION_SOURCE,
  STORAGE_TWITCH_CHROME_TRANSLATION,
  STORAGE_TWITCH_CHANNEL_LANGUAGE,
  STORAGE_SHOW_YOUTUBE_CAPTION_TOGGLE,
  STORAGE_THEME,
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  STORAGE_TOGGLE_Y_POSITION,
  STORAGE_TRANSLATION_MASK_PRIVATE,
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

// How caption lines show: the translation alone, with the original over or under it, or the
// original alone (the translation still comes, for word lookups and the subtitle file).
export type CaptionDisplayMode = 'translation' | 'bilingual' | 'translationFirst' | 'original';

// YouTube's and Twitch's.
export const captionDisplayAtom = atomWithChromeStorage<CaptionDisplayMode>(STORAGE_CAPTION_DISPLAY, 'translation');

// Netflix's own, and both by default: Netflix already shows one language, so the point there is two.
export const netflixCaptionDisplayAtom = atomWithChromeStorage<CaptionDisplayMode>(
  STORAGE_NETFLIX_CAPTION_DISPLAY,
  'bilingual'
);

// How captions look on every site (components/Youtube/CaptionDisplay.tsx). 'yellow' is the mint
// translation, keeping the name it was saved under when it was yellow.
export type CaptionStyle = 'default' | 'translucent' | 'outline' | 'yellow';

export const captionStyleAtom = atomWithChromeStorage<CaptionStyle>(STORAGE_CAPTION_STYLE, 'default');

// The word being said shows in color, where speech recognition timed its words. Off unless chosen.
export const captionWordHighlightAtom = atomWithChromeStorage<boolean>(STORAGE_CAPTION_WORD_HIGHLIGHT, false);

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

export const useYoutubeKeyboardNavigateAtom = atomWithChromeStorage<boolean>(
  STORAGE_USE_YOUTUBE_KEYBOARD_NAVIGATE,
  defaultUseYoutubeKeyboardNavigate
);

export const youtubeCaptionSizeRatioAtom = atomWithChromeStorage<number>(
  STORAGE_YOUTUBE_CAPTION_SIZE_RATIO,
  defaultCaptionSizeRatio
);

// Turns captions on by itself on videos spoken in this language, or in any language but the target
// language ('other'). YouTube and Netflix each have their own.
export type CaptionAutoActivate = 'off' | 'other' | Language;

export const youtubeAutoActivateAtom = atomWithChromeStorage<CaptionAutoActivate>(
  STORAGE_YOUTUBE_AUTO_ACTIVATE,
  'off'
);

export const netflixAutoActivateAtom = atomWithChromeStorage<CaptionAutoActivate>(
  STORAGE_NETFLIX_AUTO_ACTIVATE,
  'off'
);

export const toggleHiddenSiteListAtom = atomWithChromeStorage<string[]>(
  STORAGE_TOGGLE_HIDDEN_SITE_LIST,
  defaultToggleHiddenSiteList
);

// Page translation shows each translation under its original, or in its place. Every frame's
// translations read it themselves (components/Translation/ShizueTranslationOverlay.ts).
export type PageTranslationMode = 'bilingual' | 'translationOnly';

export const pageTranslationModeAtom = atomWithChromeStorage<PageTranslationMode>(
  STORAGE_PAGE_TRANSLATION_MODE,
  'bilingual'
);

// Page translation sends private values as placeholders (lib/sensitiveText.ts). PageTranslator
// reads it itself when translation starts.
export const translationMaskPrivateAtom = atomWithChromeStorage<boolean>(
  STORAGE_TRANSLATION_MASK_PRIVATE,
  true
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
export const useCaptionDisplay = () => useAtom(captionDisplayAtom);
export const useNetflixCaptionDisplay = () => useAtom(netflixCaptionDisplayAtom);
export const useCaptionStyle = () => useAtom(captionStyleAtom);
export const useCaptionWordHighlight = () => useAtom(captionWordHighlightAtom);
export const useTwitchCaptionSource = () => useAtom(twitchCaptionSourceAtom);
export const useTwitchChannelLanguage = () => useAtom(twitchChannelLanguageAtom);
export const useSpeechRecognitionConsent = () => useAtom(speechRecognitionConsentAtom);
export const useTwitchChromeTranslation = () => useAtom(twitchChromeTranslationAtom);
export const useYoutubeChannelLanguage = () => useAtom(youtubeChannelLanguageAtom);
export const useUseYoutubeKeyboardNavigate = () => useAtom(useYoutubeKeyboardNavigateAtom);
export const useYoutubeCaptionSizeRatio = () => useAtom(youtubeCaptionSizeRatioAtom);
export const useYoutubeAutoActivate = () => useAtom(youtubeAutoActivateAtom);
export const useNetflixAutoActivate = () => useAtom(netflixAutoActivateAtom);
export const useToggleHiddenSiteList = () => useAtom(toggleHiddenSiteListAtom);
export const usePageTranslationMode = () => useAtom(pageTranslationModeAtom);
export const useTranslationMaskPrivate = () => useAtom(translationMaskPrivateAtom);
