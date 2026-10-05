import {
  STORAGE_ANTHROPIC_KEY,
  STORAGE_CHAT_MODEL,
  STORAGE_CONNECTION_MODE,
  STORAGE_GEMINI_KEY,
  STORAGE_OPENAI_KEY,
  STORAGE_OPENROUTER_KEY,
  STORAGE_TRANSLATE_MODEL,
} from '@/config/constants';
import {
  ChatModel,
  ConnectionMode,
  isChatModel,
  isConnectionMode,
  MODELS,
  TranslateModel,
} from '@/lib/modelRegistry';

let currentChatModel: ChatModel = 'gpt';
let currentTranslateModel: TranslateModel = 'gpt-mini';
let openaiKey: string | undefined = undefined;
let geminiKey: string | undefined = undefined;
let anthropicKey: string | undefined = undefined;
let openrouterKey: string | undefined = undefined;
let connectionMode: ConnectionMode = 'direct';

export const getCurrentChatModel = () => currentChatModel;

export const getCurrentTranslateModel = () => currentTranslateModel;

export const getCurrentOpenaiKey = () => openaiKey;

export const getCurrentGeminiKey = () => geminiKey;

export const getCurrentAnthropicKey = () => anthropicKey;

export const getCurrentOpenrouterKey = () => openrouterKey;

// With no key set this returns 'direct', so the model factory reports the provider key missing.
// OpenRouter-only models always return 'openrouter', so a missing key is reported as OpenRouter's.
export const getConnectionModeFor = (model: ChatModel): ConnectionMode => {
  const { provider } = MODELS[model];
  if (!provider) return 'openrouter';
  const directKey = {
    'openai-api-key': openaiKey,
    'gemini-api-key': geminiKey,
    'anthropic-api-key': anthropicKey,
  }[provider];
  if (directKey && openrouterKey) return connectionMode;
  return openrouterKey ? 'openrouter' : 'direct';
};

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

export const changeOpenrouterKey = (key: string | undefined) => {
  openrouterKey = key;
};

export const changeConnectionMode = (mode: ConnectionMode) => {
  connectionMode = mode;
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
      STORAGE_OPENROUTER_KEY,
      STORAGE_CONNECTION_MODE,
    ])
    .then((res) => {
      if (isChatModel(res.CHAT_MODEL)) changeChatModel(res.CHAT_MODEL);
      if (isChatModel(res.TRANSLATE_MODEL)) changeTranslateModel(res.TRANSLATE_MODEL);
      changeOpenaiKey((res.OPENAI_KEY as string) || undefined);
      changeGeminiKey((res.GEMINI_KEY as string) || undefined);
      changeAnthropicKey((res.ANTHROPIC_KEY as string) || undefined);
      changeOpenrouterKey((res.OPENROUTER_KEY as string) || undefined);
      if (isConnectionMode(res.CONNECTION_MODE)) changeConnectionMode(res.CONNECTION_MODE);
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
      if (changes.OPENROUTER_KEY) {
        changeOpenrouterKey((changes.OPENROUTER_KEY.newValue as string) || undefined);
      }
      if (changes.CONNECTION_MODE) {
        const newMode = changes.CONNECTION_MODE.newValue;
        changeConnectionMode(isConnectionMode(newMode) ? newMode : 'direct');
      }
    }
  });
};
