import {
  STORAGE_ANTHROPIC_VALIDATED,
  STORAGE_CHAT_MODEL,
  STORAGE_CONNECTION_MODE,
  STORAGE_GEMINI_VALIDATED,
  STORAGE_OPENAI_VALIDATED,
  STORAGE_OPENROUTER_VALIDATED,
  STORAGE_TRANSLATE_MODEL,
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
  MODEL_OPTIONS,
  MODELS,
  ModelProvider,
  TranslateModel,
} from '@/lib/modelRegistry';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const defaultOpenAIChatModel: ChatModel = 'gpt';
export const defaultOpenAITranslateModel: TranslateModel = 'gpt-mini';
export const defaultGeminiChatModel: ChatModel = 'gemini-flash';
export const defaultGeminiTranslateModel: TranslateModel = 'gemini-flash-lite';
export const defaultAnthropicChatModel: ChatModel = 'claude-sonnet';
export const defaultAnthropicTranslateModel: TranslateModel = 'claude-haiku';
export const defaultOpenRouterChatModel: ChatModel = 'gpt';
export const defaultOpenRouterTranslateModel: TranslateModel = 'gpt-mini';

export const defaultOpenAIValidated = undefined;
export const defaultGeminiValidated = undefined;
export const defaultAnthropicValidated = undefined;
export const defaultOpenRouterValidated = undefined;
export const defaultConnectionMode: ConnectionMode = 'direct';

export const chatModelAtom = atomWithStorage<ChatModel>(
  STORAGE_CHAT_MODEL,
  defaultOpenAIChatModel,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
export const translateModelAtom = atomWithStorage<TranslateModel>(
  STORAGE_TRANSLATE_MODEL,
  defaultOpenAITranslateModel,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const openAIValidatedAtom = atomWithStorage<boolean | undefined>(
  STORAGE_OPENAI_VALIDATED,
  defaultOpenAIValidated,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
export const geminiValidatedAtom = atomWithStorage<boolean | undefined>(
  STORAGE_GEMINI_VALIDATED,
  defaultGeminiValidated,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const anthropicValidatedAtom = atomWithStorage<boolean | undefined>(
  STORAGE_ANTHROPIC_VALIDATED,
  defaultAnthropicValidated,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const openRouterValidatedAtom = atomWithStorage<boolean | undefined>(
  STORAGE_OPENROUTER_VALIDATED,
  defaultOpenRouterValidated,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const connectionModeAtom = atomWithStorage<ConnectionMode>(
  STORAGE_CONNECTION_MODE,
  defaultConnectionMode,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const openAIValidatedSafeAtom = atom(
  (get) => {
    const validated = get(openAIValidatedAtom);
    if (validated !== undefined) {
      return validated;
    }
    return Boolean(get(openAIKeyAtom));
  },
  (_, set, value: boolean) => set(openAIValidatedAtom, value)
);

export const geminiValidatedSafeAtom = atom(
  (get) => {
    const validated = get(geminiValidatedAtom);
    if (validated !== undefined) {
      return validated;
    }
    return Boolean(get(geminiKeyAtom));
  },
  (_, set, value: boolean) => set(geminiValidatedAtom, value)
);

export const anthropicValidatedSafeAtom = atom(
  (get) => {
    const validated = get(anthropicValidatedAtom);
    if (validated !== undefined) {
      return validated;
    }
    return Boolean(get(anthropicKeyAtom));
  },
  (_, set, value: boolean) => set(anthropicValidatedAtom, value)
);

export const openRouterValidatedSafeAtom = atom(
  (get) => {
    const validated = get(openRouterValidatedAtom);
    if (validated !== undefined) {
      return validated;
    }
    return Boolean(get(openRouterKeyAtom));
  },
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

// Whether each model can be called, through its provider key or OpenRouter. A hook rather than a
// derived atom: the storage atoms start as promises, which useAtomValue unwraps.
export const useModelAvailability = (): Record<ChatModel, boolean> => {
  const openRouterValidated = useAtomValue(openRouterValidatedSafeAtom);
  const directValidated: Record<ModelProvider, boolean | undefined> = {
    'openai-api-key': useAtomValue(openAIValidatedSafeAtom),
    'gemini-api-key': useAtomValue(geminiValidatedSafeAtom),
    'anthropic-api-key': useAtomValue(anthropicValidatedSafeAtom),
  };
  return Object.fromEntries(
    MODEL_OPTIONS.map((model) => {
      const { provider } = MODELS[model];
      return [model, Boolean((provider && directValidated[provider]) || openRouterValidated)];
    })
  ) as Record<ChatModel, boolean>;
};
export const useAnyModelAvailable = () => Object.values(useModelAvailability()).some(Boolean);
