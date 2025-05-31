import { MESSAGE_TRANSLATE_HTML_TEXT } from '@/config/constants';
import { TranslationResult } from '@/services/background/chatModelHandler';

async function translateHtmlText(text: string) {
  const result: TranslationResult = await chrome.runtime.sendMessage({
    action: MESSAGE_TRANSLATE_HTML_TEXT,
    text,
  });
  return result;
}

export const translationService = {
  translateHtmlText,
};
