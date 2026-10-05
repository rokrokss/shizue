import { SelectionActionType, STORAGE_GLOBAL_STATE } from '@/config/constants';
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

export async function initSelectionActionContent(
  actionType: SelectionActionType,
  text: string,
  title: string,
  pageLink: string
) {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType,
    selectionText: text,
    // The summary fields hold the source page, as for page summaries.
    summaryTitle: title,
    summaryPageLink: pageLink,
  });
}

export async function initMemoPageContent() {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'memo',
  });
}

export async function initDescribeImageContent(imageBase64: string, imageUrl: string) {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'describeImage',
    imageBase64: imageBase64,
    imageUrl: imageUrl,
  });
}

export async function initExtractImageTextContent(imageBase64: string, imageUrl: string) {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'extractImageText',
    imageBase64: imageBase64,
    imageUrl: imageUrl,
  });
}
