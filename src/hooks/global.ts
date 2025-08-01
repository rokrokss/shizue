import { STORAGE_GLOBAL_STATE, STORAGE_USER_INFO, STORAGE_API_MODE } from '@/config/constants';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { Atom, atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { UserInfo } from '@/services/authService';

export const sidePanelHydratedAtom = atom(false);

export const messageAddedInPanelAtom = atom<number | null>(null);

export type ActionType =
  | 'chat'
  | 'askForSummary'
  | 'translatePdf'
  | 'describeImage'
  | 'extractImageText'
  | 'memo';

export type GlobalState = {
  actionType: ActionType;
  threadId?: string;
  summaryTitle?: string;
  summaryText?: string;
  summaryPageLink?: string;
  imageBase64?: string;
  imageUrl?: string;
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

export const useActionType = () => useAtom(actionTypeAtom);

// Auth related atoms
export const authStateAtom = atom<{
  isAuthenticated: boolean;
  isLoading: boolean;
}>({
  isAuthenticated: false,
  isLoading: true,
});

export const userInfoAtom = atomWithStorage<UserInfo | null>(
  STORAGE_USER_INFO,
  null,
  chromeStorageBackend('local'),
  { getOnInit: false }
);

export type ApiMode = 'shizue' | 'user-key';

export const apiModeAtom = atomWithStorage<ApiMode>(
  STORAGE_API_MODE,
  'user-key', // Default to user's own API key
  chromeStorageBackend('local'),
  { getOnInit: false }
);
