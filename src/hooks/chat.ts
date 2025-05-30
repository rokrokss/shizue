import { getInitialMessagesForAllThreads, ThreadWithInitialMessages } from '@/lib/indexDB';
import { liveQuery, Observable } from 'dexie';
import { atomWithObservable } from 'jotai/utils';

export const initialMessagesForAllThreadsAtom = atomWithObservable<ThreadWithInitialMessages[]>(
  (getJotai) => {
    const observable: Observable<ThreadWithInitialMessages[]> = liveQuery(() =>
      getInitialMessagesForAllThreads()
    );
    return observable;
  },
  { initialValue: [] }
);
