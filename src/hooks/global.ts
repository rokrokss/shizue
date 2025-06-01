import { STORAGE_GLOBAL_STATE } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { Atom, atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const sidePanelHydratedAtom = atom(false);

export const messageAddedInPanelAtom = atom<number | null>(null);

export type ActionType = 'chat' | 'askForSummary';

export type GlobalState = {
  actionType: ActionType;
  threadId?: string;
  summaryTitle?: string;
  summaryText?: string;
  summaryPageLink?: string;
};

export const defaultGlobalState: GlobalState = {
  actionType: 'chat',
};

export const globalStateAtom = atomWithStorage<GlobalState>(
  STORAGE_GLOBAL_STATE,
  defaultGlobalState,
  chromeStorageBackend('local'),
  { getOnInit: false }
);

export const threadIdAtom = atom(
  (get) => get(globalStateAtom as Atom<GlobalState>).threadId,
  (get, set, newThreadId: string | undefined) => {
    const globalState = get(globalStateAtom);
    set(globalStateAtom, { ...globalState, threadId: newThreadId });
  }
);

export const actionTypeAtom = atom(
  (get) => get(globalStateAtom as Atom<GlobalState>).actionType,
  (get, set, newActionType: ActionType) => {
    const globalState = get(globalStateAtom);
    set(globalStateAtom, { ...globalState, actionType: newActionType });
  }
);
