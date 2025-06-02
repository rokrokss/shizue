import { MESSAGE_TRANSLATE_HTML_TEXT, MESSAGE_TRANSLATE_HTML_TEXT_BATCH } from '@/config/constants';
import {
  BatchTranslationResult,
  TranslationResult,
} from '@/services/background/translationHandler';

async function translateHtmlText(text: string) {
  const result: TranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT,
    text,
  });
  return result;
}

async function translateHtmlTextBatch(texts: string[]) {
  const result: BatchTranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
    texts,
  });
  return result;
}

export const translationService = {
  translateHtmlText,
  translateHtmlTextBatch,
};
