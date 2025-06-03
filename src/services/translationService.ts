import { MESSAGE_CAN_TRANSLATE, MESSAGE_TRANSLATE_HTML_TEXT_BATCH } from '@/config/constants';
import { debugLog } from '@/logs';
import { BatchTranslationResult } from '@/services/background/translationHandler';

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

export const translationService = {
  canTranslate,
  translateHtmlTextBatch,
};
