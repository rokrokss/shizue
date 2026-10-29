import { SelectionActionType, STORAGE_GLOBAL_STATE } from '@/config/constants';
import { readStorage, setStorage } from '@/lib/storageBackend';

export async function initSummarizePageContent(
  title: string,
  text: string,
  pageLink: string,
  { video, captions, storyboard }: { video: boolean; captions: boolean; storyboard?: string }
) {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  const saved = await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'askForSummary',
    summaryTitle: title,
    summaryPageLink: pageLink,
    summaryText: text,
    summaryVideo: video,
    summaryCaptions: captions,
    summaryStoryboard: storyboard,
  });
  if (!saved) throw new Error('Unable to save page summary.');
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

// The word list, from the caption word popup's link.
export async function initWordsPageContent() {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'words',
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
