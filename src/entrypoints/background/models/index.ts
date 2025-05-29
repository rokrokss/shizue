import { STORAGE_MODELS } from '@/config/constants';
import { ChatModel, TranslateModel } from '@/utils/models';

let currentChatModel: ChatModel = 'gpt-4.1';
let currentTranslateModel: TranslateModel = 'gpt-4.1';

export const getCurrentChatModel = () => currentChatModel;

export const getCurrentTranslateModel = () => currentTranslateModel;

export const changeChatModel = (model: ChatModel) => {
  currentChatModel = model;
};

export const changeTranslateModel = (model: TranslateModel) => {
  currentTranslateModel = model;
};

export const modelListeners = () => {
  chrome.storage.local.get(STORAGE_MODELS, (res) => {
    const newChatModel = res.MODELS?.chatModel as ChatModel;
    const newTranslateModel = res.MODELS?.translateModel as TranslateModel;
    if (newChatModel) changeChatModel(newChatModel);
    if (newTranslateModel) changeTranslateModel(newTranslateModel);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.MODELS) {
      const newChatModel = changes.MODELS.newValue?.chatModel as ChatModel;
      const newTranslateModel = changes.MODELS.newValue?.translateModel as TranslateModel;
      if (newChatModel) changeChatModel(newChatModel);
      if (newTranslateModel) changeTranslateModel(newTranslateModel);
    }
  });
};
