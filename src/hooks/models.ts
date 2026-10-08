import {
  STORAGE_ANTHROPIC_VALIDATED,
  STORAGE_CHAT_MODEL,
  STORAGE_CONNECTION_MODE,
  STORAGE_GEMINI_VALIDATED,
  STORAGE_LOCAL_SERVER,
  STORAGE_CHATGPT_CONNECTION,
  STORAGE_OPENAI_VALIDATED,
  STORAGE_OPENROUTER_VALIDATED,
  STORAGE_TRANSLATE_MODEL,
  STORAGE_PROVIDER_MODEL_PREFERENCES,
} from '@/config/constants';
import {
  anthropicKeyAtom,
  geminiKeyAtom,
  openAIKeyAtom,
  openRouterKeyAtom,
} from '@/hooks/settings';
import {
  ChatModel,
  ConnectionMode,
  isLocalModel,
  isChatGPTModel,
  isSelectableChatGPTModelId,
  chatGPTModelId,
  chatGPTModelRef,
  formatModelName,
  localModelId,
  localModelRef,
  LocalServerConfig,
  MODEL_OPTIONS,
  MODELS,
  ModelProvider,
  TranslateModel,
} from '@/lib/modelRegistry';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { ChatGPTConnection, disconnectedChatGPT } from '@/lib/chatgpt';
import { defaultOpenAIChatModel, defaultOpenAITranslateModel, ProviderModelPreferences, registeredAIProviders } from '@/lib/modelPreferences';

export {
  defaultOpenAIChatModel, defaultOpenAITranslateModel,
  defaultGeminiChatModel, defaultGeminiTranslateModel,
  defaultAnthropicChatModel, defaultAnthropicTranslateModel,
  defaultOpenRouterChatModel, defaultOpenRouterTranslateModel,
} from '@/lib/modelPreferences';

export const defaultOpenAIValidated = undefined;
export const defaultGeminiValidated = undefined;
export const defaultAnthropicValidated = undefined;
export const defaultOpenRouterValidated = undefined;
export const defaultConnectionMode: ConnectionMode = 'direct';

export const chatModelAtom = atomWithChromeStorage<ChatModel>(
  STORAGE_CHAT_MODEL,
  defaultOpenAIChatModel
);
export const translateModelAtom = atomWithChromeStorage<TranslateModel>(
  STORAGE_TRANSLATE_MODEL,
  defaultOpenAITranslateModel
);

export const providerModelPreferencesAtom = atomWithChromeStorage<ProviderModelPreferences>(
  STORAGE_PROVIDER_MODEL_PREFERENCES,
  { selections: {} }
);
export const useProviderModelPreferences = () => useAtom(providerModelPreferencesAtom);

export const openAIValidatedAtom = atomWithChromeStorage<boolean | undefined>(
  STORAGE_OPENAI_VALIDATED,
  defaultOpenAIValidated
);
export const geminiValidatedAtom = atomWithChromeStorage<boolean | undefined>(
  STORAGE_GEMINI_VALIDATED,
  defaultGeminiValidated
);

export const anthropicValidatedAtom = atomWithChromeStorage<boolean | undefined>(
  STORAGE_ANTHROPIC_VALIDATED,
  defaultAnthropicValidated
);

export const openRouterValidatedAtom = atomWithChromeStorage<boolean | undefined>(
  STORAGE_OPENROUTER_VALIDATED,
  defaultOpenRouterValidated
);

export const connectionModeAtom = atomWithChromeStorage<ConnectionMode>(
  STORAGE_CONNECTION_MODE,
  defaultConnectionMode
);

// The connected local server and its chat models; null until the user connects one.
export const localServerAtom = atomWithChromeStorage<LocalServerConfig | null>(
  STORAGE_LOCAL_SERVER,
  null
);

// Public account labels and model choices only. OAuth credentials are held by the native helper.
export const chatGPTConnectionAtom = atomWithChromeStorage<ChatGPTConnection>(
  STORAGE_CHATGPT_CONNECTION, disconnectedChatGPT
);
export const useChatGPTConnectionValue = () => useAtomValue(chatGPTConnectionAtom);

// A storage atom holds the promise chrome.storage resolves to until its first change, so unwrap it
// before treating the flag as missing and falling back to whether a key is set.
const validatedOrHasKey = (
  validated: boolean | undefined | Promise<boolean | undefined>,
  key: string | Promise<string>
): boolean | Promise<boolean> => {
  if (validated instanceof Promise) return validated.then((v) => validatedOrHasKey(v, key));
  if (validated !== undefined) return validated;
  return key instanceof Promise ? key.then(Boolean) : Boolean(key);
};

export const openAIValidatedSafeAtom = atom(
  (get) => validatedOrHasKey(get(openAIValidatedAtom), get(openAIKeyAtom)),
  (_, set, value: boolean) => set(openAIValidatedAtom, value)
);

export const geminiValidatedSafeAtom = atom(
  (get) => validatedOrHasKey(get(geminiValidatedAtom), get(geminiKeyAtom)),
  (_, set, value: boolean) => set(geminiValidatedAtom, value)
);

export const anthropicValidatedSafeAtom = atom(
  (get) => validatedOrHasKey(get(anthropicValidatedAtom), get(anthropicKeyAtom)),
  (_, set, value: boolean) => set(anthropicValidatedAtom, value)
);

export const openRouterValidatedSafeAtom = atom(
  (get) => validatedOrHasKey(get(openRouterValidatedAtom), get(openRouterKeyAtom)),
  (_, set, value: boolean) => set(openRouterValidatedAtom, value)
);

export const useChatModel = () => useAtom(chatModelAtom);
export const useTranslateModel = () => useAtom(translateModelAtom);
export const useSetChatModel = () => useSetAtom(chatModelAtom);
export const useSetTranslateModel = () => useSetAtom(translateModelAtom);
export const useOpenAIValidated = () => useAtom(openAIValidatedSafeAtom);
export const useGeminiValidated = () => useAtom(geminiValidatedSafeAtom);
export const useAnthropicValidated = () => useAtom(anthropicValidatedSafeAtom);
export const useOpenAIValidatedValue = () => useAtomValue(openAIValidatedSafeAtom);
export const useGeminiValidatedValue = () => useAtomValue(geminiValidatedSafeAtom);
export const useAnthropicValidatedValue = () => useAtomValue(anthropicValidatedSafeAtom);
export const useSetOpenAIValidated = () => useSetAtom(openAIValidatedSafeAtom);
export const useSetGeminiValidated = () => useSetAtom(geminiValidatedSafeAtom);
export const useSetAnthropicValidated = () => useSetAtom(anthropicValidatedSafeAtom);
export const useOpenRouterValidated = () => useAtom(openRouterValidatedSafeAtom);
export const useSetOpenRouterValidated = () => useSetAtom(openRouterValidatedSafeAtom);
export const useConnectionMode = () => useAtom(connectionModeAtom);
export const useLocalServer = () => useAtom(localServerAtom);
export const useLocalServerValue = () => useAtomValue(localServerAtom);

export const useRegisteredAIProviders = () => registeredAIProviders({
  'openai-api-key': useAtomValue(openAIKeyAtom),
  'openrouter-api-key': useAtomValue(openRouterKeyAtom),
  'gemini-api-key': useAtomValue(geminiKeyAtom),
  'anthropic-api-key': useAtomValue(anthropicKeyAtom),
}, {
  'openai-api-key': useAtomValue(openAIValidatedSafeAtom),
  'openrouter-api-key': useAtomValue(openRouterValidatedSafeAtom),
  'gemini-api-key': useAtomValue(geminiValidatedSafeAtom),
  'anthropic-api-key': useAtomValue(anthropicValidatedSafeAtom),
}, useLocalServerValue()?.models ?? []);

export interface ModelOption {
  value: ChatModel;
  label: string;
  available: boolean;
}

// What the model pickers list: the cloud models, available through their provider key or
// OpenRouter, then each chat model on the connected local server. A local model picked earlier
// that the server no longer has stays listed, unavailable, so the picker still names it. A hook
// rather than a derived atom: the storage atoms start as promises, which useAtomValue unwraps.
export const useModelOptions = (): ModelOption[] => {
  const { t } = useTranslation();
  const openRouterValidated = useAtomValue(openRouterValidatedSafeAtom);
  const localServer = useAtomValue(localServerAtom);
  const chatGPT = useChatGPTConnectionValue();
  const chatModel = useAtomValue(chatModelAtom);
  const translateModel = useAtomValue(translateModelAtom);
  const directValidated: Record<ModelProvider, boolean | undefined> = {
    'openai-api-key': useAtomValue(openAIValidatedSafeAtom),
    'gemini-api-key': useAtomValue(geminiValidatedSafeAtom),
    'anthropic-api-key': useAtomValue(anthropicValidatedSafeAtom),
  };
  const localLabel = (id: string) => `${id} (${t('local.tag')})`;
  const localIds = localServer?.models.map((model) => model.id) ?? [];
  const missingLocalIds = [chatModel, translateModel]
    .filter(isLocalModel)
    .map(localModelId)
    .filter((id, i, ids) => !localIds.includes(id) && ids.indexOf(id) === i);
  return [
    ...MODEL_OPTIONS.map((model) => {
      const { provider, label } = MODELS[model];
      const available = Boolean((provider && directValidated[provider]) || openRouterValidated);
      return { value: model, label, available };
    }),
    ...localIds.map((id) => ({ value: localModelRef(id), label: localLabel(id), available: true })),
    ...missingLocalIds.map((id) => ({
      value: localModelRef(id),
      label: localLabel(id),
      available: false,
    })),
    ...chatGPT.models.filter(({ id }) => isSelectableChatGPTModelId(id))
      .map((model) => ({ value: chatGPTModelRef(model.id), label: model.label, available: chatGPT.connected })),
    ...[...new Set([chatModel, translateModel].filter(isChatGPTModel))]
      .filter((model) => isSelectableChatGPTModelId(chatGPTModelId(model)) && !chatGPT.models.some((entry) => chatGPTModelRef(entry.id) === model))
      .map((model) => ({ value: model, label: formatModelName(model), available: false })),
  ];
};
export const useAnyModelAvailable = () => useModelOptions().some((option) => option.available);
