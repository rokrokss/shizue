import { STORAGE_MODELS, STORAGE_SETTINGS } from '@/config/constants';
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
  chrome.storage.local.get(STORAGE_MODELS, (res) => {
    const newChatModel = res.MODELS?.chatModel as ChatModel;
    const newTranslateModel = res.MODELS?.translateModel as TranslateModel;
    if (newChatModel) changeChatModel(newChatModel);
    if (newTranslateModel) changeTranslateModel(newTranslateModel);
  });

  chrome.storage.local.get(STORAGE_SETTINGS, (res) => {
    const newOpenaiKey = res.SETTINGS?.openAIKey as string;
    if (newOpenaiKey) changeOpenaiKey(newOpenaiKey);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.MODELS) {
      const newChatModel = changes.MODELS.newValue?.chatModel as ChatModel;
      const newTranslateModel = changes.MODELS.newValue?.translateModel as TranslateModel;
      if (newChatModel) changeChatModel(newChatModel);
      if (newTranslateModel) changeTranslateModel(newTranslateModel);
    }

    if (area === 'local' && changes.SETTINGS) {
      const newOpenaiKey = changes.SETTINGS.newValue?.openAIKey as string;
      if (newOpenaiKey) changeOpenaiKey(newOpenaiKey);
    }
  });
};
