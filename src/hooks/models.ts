import { STORAGE_CHAT_MODEL, STORAGE_TRANSLATE_MODEL } from '@/config/constants';
import { ChatModel, TranslateModel } from '@/lib/models';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const defaultChatModel: ChatModel = 'gpt-4.1';
export const defaultTranslateModel: TranslateModel = 'gpt-4.1-mini';

export const chatModelAtom = atomWithStorage<ChatModel>(
  STORAGE_CHAT_MODEL,
  defaultChatModel,
  chromeStorageBackend('local'),
  { getOnInit: true }
);
export const translateModelAtom = atomWithStorage<TranslateModel>(
  STORAGE_TRANSLATE_MODEL,
  defaultTranslateModel,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useChatModel = () => useAtom(chatModelAtom);
export const useTranslateModel = () => useAtom(translateModelAtom);
