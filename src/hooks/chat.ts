import { STORAGE_CURRENT_CHAT } from '@/config/constants';
import {
  getInitialMessagesForAllThreads,
  listThreads,
  ThreadWithInitialMessages,
} from '@/lib/indexDB';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { liveQuery, Observable } from 'dexie';
import { atom, Atom, useAtom } from 'jotai';
import { atomWithObservable, atomWithStorage } from 'jotai/utils';

export type CurrentChat = {
  threadId?: string;
};

export const defaultCurrentChat: CurrentChat = {};

export const currentChatAtom = atomWithStorage<CurrentChat>(
  STORAGE_CURRENT_CHAT,
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

export const initialMessagesForAllThreadsAtom = atomWithObservable<ThreadWithInitialMessages[]>(
  (getJotai) => {
    const observable: Observable<ThreadWithInitialMessages[]> = liveQuery(() =>
      getInitialMessagesForAllThreads()
    );
    return observable;
  },
  { initialValue: [] }
);
