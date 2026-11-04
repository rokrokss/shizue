import {
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_IMAGE,
  MESSAGE_TRANSLATE_LIVE_CAPTION,
  MESSAGE_TRANSLATE_SUBTITLES,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import type { TranslationContext } from '@/lib/liveCaption/types';
import type { LiveCaptionMetadata, PageContext, SubtitleMetadata } from '@/lib/prompts';
import { Caption, VideoMetadata } from '@/lib/youtube';
import type { ImageTranslationResult } from '@/services/background/imageTranslationHandler';
import {
  BatchTranslationResult,
  LiveCaptionTranslationResult,
  YoutubeCaptionTranslationResult,
} from '@/services/background/translationHandler';

async function translateHtmlTextBatch(texts: string[], context?: PageContext) {
  const result: BatchTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
    texts,
    context,
  });
  return result;
}

async function translateYoutubeCaption(
  captions: Caption[],
  context: TranslationContext[],
  following: string[],
  targetLanguage: Language,
  metadata: VideoMetadata
) {
  const result: YoutubeCaptionTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
    captions,
    context,
    following,
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

// An image on the page (lib/imageTranslator.ts); `dataUrl` when the background can't fetch it.
async function translateImage(srcUrl: string, dataUrl: string | undefined, targetLanguage: Language, title: string) {
  const result: ImageTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_IMAGE,
    srcUrl,
    dataUrl,
    targetLanguage,
    title,
  });
  return result;
}

export const translationService = {
  translateHtmlTextBatch,
  translateImage,
  translateYoutubeCaption,
  translateLiveCaption,
  translateSubtitles,
};
