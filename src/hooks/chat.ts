import { getInitialMessagesForAllThreads, ThreadWithInitialMessages } from '@/lib/indexDB';
import { liveQuery, Observable } from 'dexie';
import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';

export type ChatStatus = 'idle' | 'waiting';

export const chatStatusAtom = atom<ChatStatus>('idle');

export const isChatIdle = (status: ChatStatus) => status === 'idle';
export const isChatWaiting = (status: ChatStatus) => status === 'waiting';

export const initialMessagesForAllThreadsAtom = atomWithObservable<ThreadWithInitialMessages[]>(
  (getJotai) => {
    const observable: Observable<ThreadWithInitialMessages[]> = liveQuery(() =>
      getInitialMessagesForAllThreads()
    );
    return observable;
  },
  { initialValue: [] }
);
