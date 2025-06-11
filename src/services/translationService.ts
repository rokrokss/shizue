import {
  MESSAGE_CAN_TRANSLATE,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import { Caption, VideoMetadata } from '@/lib/youtube';
import { debugLog } from '@/logs';
import {
  BatchTranslationResult,
  YoutubeCaptionTranslationResult,
} from '@/services/background/translationHandler';

async function canTranslate() {
  const result: boolean = await chrome.runtime.sendMessage({
    action: MESSAGE_CAN_TRANSLATE,
  });
  debugLog('canTranslate result:', result);
  return result;
}

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

export const translationService = {
  canTranslate,
  translateHtmlTextBatch,
  translateYoutubeCaption,
};
