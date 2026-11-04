import { STORAGE_REASONING_EFFORT } from '@/config/constants';
import { threadIdAtom } from '@/hooks/global';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import type { ReasoningEffort } from '@/lib/reasoning';
import { getInitialMessagesForAllThreads, ThreadWithInitialMessages, db } from '@/lib/indexDB';
import { chatService } from '@/services/chatService';
import { liveQuery, Observable } from 'dexie';
import { atom, useAtom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';

export type ChatStatus = 'idle' | 'waiting';

export const chatStatusAtom = atom<ChatStatus>('idle');

export const isChatIdle = (status: ChatStatus) => status === 'idle';

// The chat model's thinking effort, kept for the chats after it (the background reads it per answer).
export const reasoningEffortAtom = atomWithChromeStorage<ReasoningEffort>(STORAGE_REASONING_EFFORT, 'medium');
export const useReasoningEffort = () => useAtom(reasoningEffortAtom);
export const isChatWaiting = (status: ChatStatus) => status === 'waiting';

// Leaving a thread while it answers stops the answer as the stop button does: with the status
// idle again, Chat's thread effect cuts the stream and the background saves the answer as stopped.
export const switchThreadAtom = atom(null, (get, set, threadId: string | undefined) => {
  const current = get(threadIdAtom);
  if (threadId === current) return;
  if (isChatWaiting(get(chatStatusAtom))) {
    if (current) chatService.cancelNotStartedMessage(current);
    set(chatStatusAtom, 'idle');
  }
  set(threadIdAtom, threadId);
});

// null until the first query returns, so the history doesn't flash its empty message.
export const initialMessagesForAllThreadsAtom = atomWithObservable<
  ThreadWithInitialMessages[] | null
>(
  (getJotai) => {
    const observable: Observable<ThreadWithInitialMessages[]> = liveQuery(() =>
      getInitialMessagesForAllThreads()
    );
    return observable;
  },
  { initialValue: null }
);

export const createThreadMessageCountAtom = (threadId: string | undefined) => 
  atomWithObservable<number>(
    () => {
      if (!threadId) {
        return liveQuery(() => Promise.resolve(0));
      }
      
      const observable: Observable<number> = liveQuery(async () => {
        const count = await db.messages.where('threadId').equals(threadId).count();
        return count;
      });
      return observable;
    },
    { initialValue: 0 }
  );
