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

export async function initPdfPageContent() {
  const prevGlobalState = await readStorage<GlobalState>(STORAGE_GLOBAL_STATE);
  await setStorage(STORAGE_GLOBAL_STATE, {
    ...(prevGlobalState ?? {}),
    actionType: 'translatePdf',
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
