import {
  STORAGE_ANTHROPIC_KEY,
  STORAGE_GEMINI_KEY,
  STORAGE_OPENAI_KEY,
  STORAGE_OPENROUTER_KEY,
} from '@/config/constants';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

export const defaultOpenAIKey = '';
export const defaultGeminiKey = '';
export const defaultAnthropicKey = '';
export const defaultOpenRouterKey = '';

export const openAIKeyAtom = atomWithChromeStorage<string>(
  STORAGE_OPENAI_KEY,
  defaultOpenAIKey
);

export const geminiKeyAtom = atomWithChromeStorage<string>(
  STORAGE_GEMINI_KEY,
  defaultGeminiKey
);

export const anthropicKeyAtom = atomWithChromeStorage<string>(
  STORAGE_ANTHROPIC_KEY,
  defaultAnthropicKey
);

export const openRouterKeyAtom = atomWithChromeStorage<string>(
  STORAGE_OPENROUTER_KEY,
  defaultOpenRouterKey
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
