import { SelectionActionType, STORAGE_GLOBAL_STATE } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { atom, useAtom } from 'jotai';
import { atomWithStorage, unwrap } from 'jotai/utils';

export const messageAddedInPanelAtom = atom<number | null>(null);

export type ActionType =
  | 'chat'
  | 'askForSummary'
  | 'describeImage'
  | 'extractImageText'
  | 'memo'
  | SelectionActionType;

export type GlobalState = {
  actionType: ActionType;
  summaryTitle?: string;
  summaryText?: string;
  summaryPageLink?: string;
  selectionText?: string;
  imageBase64?: string;
  imageUrl?: string;
};

export const defaultGlobalState: GlobalState = {
  actionType: 'chat',
};

export const globalStateAtom = atomWithStorage<GlobalState>(
  STORAGE_GLOBAL_STATE,
  defaultGlobalState,
  chromeStorageBackend<GlobalState>('local'),
  { getOnInit: true }
);

// Resolve asynchronous action data before initializing the panel.
const resolvedGlobalStateAtom = unwrap(globalStateAtom);
export const sidePanelHydratedAtom = atom((get) => get(resolvedGlobalStateAtom) !== undefined);

export const updateGlobalStateAtom = atom(null, (_get, set, changes: Partial<GlobalState>) =>
  set(globalStateAtom, (prev) => prev instanceof Promise
    ? prev.then((state) => ({ ...state, ...changes }))
    : { ...prev, ...changes })
);

// Selection belongs to this panel's store. A reopened panel starts a new chat;
// saved conversations remain available through the IndexedDB history.
export const threadIdAtom = atom<string | undefined>(undefined);

export const actionTypeAtom = atom(
  (get) => get(resolvedGlobalStateAtom)?.actionType ?? 'chat',
  (_get, set, newActionType: ActionType) =>
    set(updateGlobalStateAtom, { actionType: newActionType })
);

export const useActionType = () => useAtom(actionTypeAtom);
