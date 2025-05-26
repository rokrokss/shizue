import { chromeStorageBackend } from '@/utils/storageBackend';
import { liveQuery } from 'dexie';
import { atom, Atom, useAtom } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';

export type CurrentChat = {
  threadId?: string;
};

export const defaultCurrentChat: CurrentChat = {};

export const currentChatAtom = atomWithStorage<CurrentChat>(
  'CURRENT_CHAT',
  defaultCurrentChat,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useCurrentChat = () => useAtom(currentChatAtom);

export const currentThreadIdAtom = atom(
  (get) => get(currentChatAtom as Atom<CurrentChat>).threadId,
  (get, set, newThreadId: string | undefined) => {
    const currentChat = get(currentChatAtom);
    set(currentChatAtom, { ...currentChat, threadId: newThreadId });
  }
);

export const threadsAtom = atomWithObservable(() => liveQuery(() => listThreads()));
