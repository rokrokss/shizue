import { STORAGE_GLOBAL_STATE } from '@/config/constants';
import { readStorage, setStorage } from '@/lib/storageBackend';

export async function initSummarizePageContent(title: string, text: string, pageLink: string) {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'askForSummary',
    summaryTitle: title,
    summaryPageLink: pageLink,
    summaryText: text,
  });
}
