import {
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_LIVE_CAPTION,
  MESSAGE_TRANSLATE_SUBTITLES,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import type { TranslationContext } from '@/lib/liveCaption/types';
import type { LiveCaptionMetadata, SubtitleMetadata } from '@/lib/prompts';
import { Caption, VideoMetadata } from '@/lib/youtube';
import {
  BatchTranslationResult,
  LiveCaptionTranslationResult,
  YoutubeCaptionTranslationResult,
} from '@/services/background/translationHandler';

async function translateHtmlTextBatch(texts: string[]) {
  const result: BatchTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
    texts,
  });
  return result;
}

async function translateYoutubeCaption(
  captions: Caption[],
  targetLanguage: Language,
  metadata: VideoMetadata
) {
  const result: YoutubeCaptionTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
    captions,
    targetLanguage,
    metadata,
  });
  return result;
}

async function translateLiveCaption(
  lines: string[],
  context: TranslationContext[],
  targetLanguage: Language,
  metadata: LiveCaptionMetadata
) {
  const result: LiveCaptionTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_LIVE_CAPTION,
    lines,
    context,
    targetLanguage,
    metadata,
  });
  return result;
}

async function translateSubtitles(
  lines: string[],
  context: TranslationContext[],
  following: string[],
  targetLanguage: Language,
  metadata: SubtitleMetadata
) {
  const result: LiveCaptionTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_SUBTITLES,
    lines,
    context,
    following,
    targetLanguage,
    metadata,
  });
  return result;
}

export const translationService = {
  translateHtmlTextBatch,
  translateYoutubeCaption,
  translateLiveCaption,
  translateSubtitles,
};
