import { getInitialMessagesForAllThreads, ThreadWithInitialMessages, db } from '@/lib/indexDB';
import { liveQuery, Observable } from 'dexie';
import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';

export type ChatStatus = 'idle' | 'waiting';

export const chatStatusAtom = atom<ChatStatus>('idle');

export const isChatIdle = (status: ChatStatus) => status === 'idle';
export const isChatWaiting = (status: ChatStatus) => status === 'waiting';

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
