import { STORAGE_CHAT_MODEL, STORAGE_SETTINGS, STORAGE_TRANSLATE_MODEL } from '@/config/constants';
import { ChatModel, TranslateModel } from '@/lib/models';

let currentChatModel: ChatModel = 'gpt-4.1';
let currentTranslateModel: TranslateModel = 'gpt-4.1';
let openaiKey: string | undefined = undefined;

export const getCurrentChatModel = () => currentChatModel;

export const getCurrentTranslateModel = () => currentTranslateModel;

export const getCurrentOpenaiKey = () => openaiKey;

export const changeChatModel = (model: ChatModel) => {
  currentChatModel = model;
};

export const changeTranslateModel = (model: TranslateModel) => {
  currentTranslateModel = model;
};

export const changeOpenaiKey = (key: string) => {
  openaiKey = key;
};

export const modelListeners = () => {
  chrome.storage.local.get(STORAGE_CHAT_MODEL, (res) => {
    const newChatModel = res.CHAT_MODEL as ChatModel;
    if (newChatModel) changeChatModel(newChatModel);
  });

  chrome.storage.local.get(STORAGE_TRANSLATE_MODEL, (res) => {
    const newTranslateModel = res.TRANSLATE_MODEL as TranslateModel;
    if (newTranslateModel) changeTranslateModel(newTranslateModel);
  });

  chrome.storage.local.get(STORAGE_SETTINGS, (res) => {
    const newOpenaiKey = res.SETTINGS?.openAIKey as string;
    if (newOpenaiKey) changeOpenaiKey(newOpenaiKey);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.CHAT_MODEL) {
      const newChatModel = changes.CHAT_MODEL.newValue?.chatModel as ChatModel;
      if (newChatModel) changeChatModel(newChatModel);
    }
    if (area === 'local' && changes.TRANSLATE_MODEL) {
      const newTranslateModel = changes.TRANSLATE_MODEL.newValue?.translateModel as TranslateModel;
      if (newTranslateModel) changeTranslateModel(newTranslateModel);
    }

    if (area === 'local' && changes.SETTINGS) {
      const newOpenaiKey = changes.SETTINGS.newValue?.openAIKey as string;
      if (newOpenaiKey) changeOpenaiKey(newOpenaiKey);
    }
  });
};
