import {
  STORAGE_ANTHROPIC_VALIDATED,
  STORAGE_CHAT_MODEL,
  STORAGE_GEMINI_VALIDATED,
  STORAGE_OPENAI_VALIDATED,
  STORAGE_TRANSLATE_MODEL,
} from '@/config/constants';
import { anthropicKeyAtom, geminiKeyAtom, openAIKeyAtom } from '@/hooks/settings';
import { ChatModel, TranslateModel } from '@/lib/models';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const defaultOpenAIChatModel: ChatModel = 'gpt-4.1';
export const defaultOpenAITranslateModel: TranslateModel = 'gpt-4.1-mini';
export const defaultGeminiChatModel: ChatModel = 'gemini-2.5-flash';
export const defaultGeminiTranslateModel: TranslateModel = 'gemini-2.5-flash-lite-preview-06-17';
export const defaultAnthropicChatModel: ChatModel = 'claude-sonnet-4-20250514';
export const defaultAnthropicTranslateModel: TranslateModel = 'claude-3-5-haiku-20241022';

export const defaultOpenAIValidated = undefined;
export const defaultGeminiValidated = undefined;
export const defaultAnthropicValidated = undefined;

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

// useChatModel and useTranslateModel moved to hooks/useSettings.ts
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
