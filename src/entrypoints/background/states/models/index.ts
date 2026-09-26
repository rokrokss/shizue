import {
  STORAGE_ANTHROPIC_KEY,
  STORAGE_CHAT_MODEL,
  STORAGE_GEMINI_KEY,
  STORAGE_OPENAI_KEY,
  STORAGE_TRANSLATE_MODEL,
} from '@/config/constants';
import { ChatModel, isChatModel, TranslateModel } from '@/lib/modelRegistry';

let currentChatModel: ChatModel = 'gpt';
let currentTranslateModel: TranslateModel = 'gpt-mini';
let openaiKey: string | undefined = undefined;
let geminiKey: string | undefined = undefined;
let anthropicKey: string | undefined = undefined;

export const getCurrentChatModel = () => currentChatModel;

export const getCurrentTranslateModel = () => currentTranslateModel;

export const getCurrentOpenaiKey = () => openaiKey;

export const getCurrentGeminiKey = () => geminiKey;

export const getCurrentAnthropicKey = () => anthropicKey;

export const changeChatModel = (model: ChatModel) => {
  currentChatModel = model;
};

export const changeTranslateModel = (model: TranslateModel) => {
  currentTranslateModel = model;
};

export const changeOpenaiKey = (key: string | undefined) => {
  openaiKey = key;
};

export const changeGeminiKey = (key: string | undefined) => {
  geminiKey = key;
};

export const changeAnthropicKey = (key: string | undefined) => {
  anthropicKey = key;
};

let modelStateReady: Promise<void> = Promise.resolve();

// Resolves once the cached settings are loaded; the service worker may have just restarted.
export const whenModelStateReady = () => modelStateReady;

export const modelListeners = () => {
  modelStateReady = chrome.storage.local
    .get([
      STORAGE_CHAT_MODEL,
      STORAGE_TRANSLATE_MODEL,
      STORAGE_OPENAI_KEY,
      STORAGE_GEMINI_KEY,
      STORAGE_ANTHROPIC_KEY,
    ])
    .then((res) => {
      if (isChatModel(res.CHAT_MODEL)) changeChatModel(res.CHAT_MODEL);
      if (isChatModel(res.TRANSLATE_MODEL)) changeTranslateModel(res.TRANSLATE_MODEL);
      changeOpenaiKey((res.OPENAI_KEY as string) || undefined);
      changeGeminiKey((res.GEMINI_KEY as string) || undefined);
      changeAnthropicKey((res.ANTHROPIC_KEY as string) || undefined);
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.CHAT_MODEL) {
        const newChatModel = changes.CHAT_MODEL.newValue;
        if (isChatModel(newChatModel)) changeChatModel(newChatModel);
      }
      if (changes.TRANSLATE_MODEL) {
        const newTranslateModel = changes.TRANSLATE_MODEL.newValue;
        if (isChatModel(newTranslateModel)) changeTranslateModel(newTranslateModel);
      }
      // An emptied or removed key must clear the cache too.
      if (changes.OPENAI_KEY) {
        changeOpenaiKey((changes.OPENAI_KEY.newValue as string) || undefined);
      }
      if (changes.GEMINI_KEY) {
        changeGeminiKey((changes.GEMINI_KEY.newValue as string) || undefined);
      }
      if (changes.ANTHROPIC_KEY) {
        changeAnthropicKey((changes.ANTHROPIC_KEY.newValue as string) || undefined);
      }
    }
  });
};
