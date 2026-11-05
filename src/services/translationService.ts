import {
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_IMAGE,
  MESSAGE_TRANSLATE_LIVE_CAPTION,
  MESSAGE_TRANSLATE_SUBTITLES,
  MESSAGE_WARM_UP_TRANSLATION,
  PORT_YOUTUBE_CAPTION,
} from '@/config/constants';
import type { TranslationContext } from '@/lib/liveCaption/types';
import type { LiveCaptionMetadata, PageContext, SubtitleMetadata } from '@/lib/prompts';
import { errorLog } from '@/logs';
import type { ImageTranslationResult } from '@/services/background/imageTranslationHandler';
import type {
  BatchTranslationResult,
  LiveCaptionTranslationResult,
  YoutubeCaptionRequest,
} from '@/services/background/translationHandler';

async function translateHtmlTextBatch(texts: string[], context?: PageContext) {
  const result: BatchTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
    texts,
    context,
  });
  return result;
}

// A chunk of YouTube captions over its own port (services/background/captionPort.ts): each line
// goes to `onLine` as it is translated. Resolves to every line's translation, or null on failure
// or once `signal` aborts, which also stops the model.
function streamYoutubeCaption(
  request: YoutubeCaptionRequest,
  onLine: (index: number, text: string) => void,
  signal: AbortSignal
) {
  return new Promise<string[] | null>((resolve) => {
    if (signal.aborted) return resolve(null);
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: PORT_YOUTUBE_CAPTION });
    } catch {
      return resolve(null);
    }
    let settled = false;
    const finish = (translations: string[] | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(translations);
      port.disconnect();
    };
    const abort = () => finish(null);
    signal.addEventListener('abort', abort, { once: true });
    port.onMessage.addListener((msg) => {
      if (Array.isArray(msg?.line)) onLine(msg.line[0], msg.line[1]);
      else if (Array.isArray(msg?.done)) finish(msg.done);
      else if (msg?.error) {
        errorLog('[YouTube] Caption translation failed:', msg.error);
        finish(null);
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      finish(null);
    });
    port.postMessage(request);
  });
}

// Captions are about to be translated: the model's connection opens meanwhile.
function warmUp() {
  chrome.runtime.sendMessage({ action: MESSAGE_WARM_UP_TRANSLATION }).catch(() => {});
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
  streamYoutubeCaption,
  translateLiveCaption,
  translateSubtitles,
  warmUp,
};
