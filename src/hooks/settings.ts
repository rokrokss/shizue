import {
  STORAGE_ANTHROPIC_KEY,
  STORAGE_GEMINI_KEY,
  STORAGE_OPENAI_KEY,
  STORAGE_OPENROUTER_KEY,
} from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const defaultOpenAIKey = '';
export const defaultGeminiKey = '';
export const defaultAnthropicKey = '';
export const defaultOpenRouterKey = '';

export const openAIKeyAtom = atomWithStorage<string>(
  STORAGE_OPENAI_KEY,
  defaultOpenAIKey,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const geminiKeyAtom = atomWithStorage<string>(
  STORAGE_GEMINI_KEY,
  defaultGeminiKey,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const anthropicKeyAtom = atomWithStorage<string>(
  STORAGE_ANTHROPIC_KEY,
  defaultAnthropicKey,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const openRouterKeyAtom = atomWithStorage<string>(
  STORAGE_OPENROUTER_KEY,
  defaultOpenRouterKey,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useOpenAIKey = () => useAtom(openAIKeyAtom);
export const useOpenAIKeyValue = () => useAtomValue(openAIKeyAtom);
export const useSetOpenAIKey = () => useSetAtom(openAIKeyAtom);
export const useGeminiKey = () => useAtom(geminiKeyAtom);
export const useGeminiKeyValue = () => useAtomValue(geminiKeyAtom);
export const useSetGeminiKey = () => useSetAtom(geminiKeyAtom);
export const useAnthropicKey = () => useAtom(anthropicKeyAtom);
export const useAnthropicKeyValue = () => useAtomValue(anthropicKeyAtom);
export const useSetAnthropicKey = () => useSetAtom(anthropicKeyAtom);
export const useOpenRouterKey = () => useAtom(openRouterKeyAtom);
export const useOpenRouterKeyValue = () => useAtomValue(openRouterKeyAtom);
export const useSetOpenRouterKey = () => useSetAtom(openRouterKeyAtom);
