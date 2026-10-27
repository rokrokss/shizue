import {
  STORAGE_CHAT_MODEL,
  STORAGE_MODEL_LIST,
  STORAGE_PROVIDER_MODEL_PREFERENCES,
  STORAGE_TRANSLATE_MODEL,
} from '@/config/constants';
import {
  bundledModelList,
  MAX_MODEL_LIST_CHARS,
  parseModelList,
  setModelList,
  type ModelList,
} from '@/lib/modelList';
import type { SavedModelList } from '@/lib/modelListStorage';
import { migrateModelSelections } from '@/lib/modelPreferences';
import { errorLog } from '@/logs';

// site/models/v1.json as deployed. A test build can point this at a local server.
const MODEL_LIST_URL = import.meta.env.WXT_MODEL_LIST_URL || 'https://shizue.net/models/v1.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Sends nothing but the request itself: no cookies, query or extra headers.
async function fetchModelList(): Promise<ModelList | undefined> {
  try {
    const response = await fetch(MODEL_LIST_URL, {
      credentials: 'omit',
      cache: 'no-cache',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    return text.length <= MAX_MODEL_LIST_CHARS ? parseModelList(JSON.parse(text)) : undefined;
  } catch {
    return undefined;
  }
}

async function migratedSelections(list: ModelList) {
  const saved = await chrome.storage.local.get([
    STORAGE_CHAT_MODEL,
    STORAGE_TRANSLATE_MODEL,
    STORAGE_PROVIDER_MODEL_PREFERENCES,
  ]);
  const changes = migrateModelSelections(list, {
    chat: saved[STORAGE_CHAT_MODEL],
    translation: saved[STORAGE_TRANSLATE_MODEL],
    preferences: saved[STORAGE_PROVIDER_MODEL_PREFERENCES],
  });
  return {
    ...('chat' in changes ? { [STORAGE_CHAT_MODEL]: changes.chat } : {}),
    ...('translation' in changes ? { [STORAGE_TRANSLATE_MODEL]: changes.translation } : {}),
    ...('preferences' in changes ? { [STORAGE_PROVIDER_MODEL_PREFERENCES]: changes.preferences } : {}),
  };
}

// Fetches the list when the last check is a day old, or always right after an update. A fetch
// that fails or doesn't validate keeps the saved list; after an update the new release's bundled
// list replaces it instead, since it was fetched for the version before.
async function checkModelList(updated: boolean) {
  const saved = (await chrome.storage.local.get(STORAGE_MODEL_LIST))[STORAGE_MODEL_LIST] as SavedModelList | undefined;
  const now = Date.now();
  if (!updated && saved && now - saved.checkedAt < CHECK_INTERVAL_MS) return;

  const fetched = await fetchModelList();
  const list = fetched ?? (updated ? bundledModelList : undefined);
  const next: SavedModelList = { checkedAt: now, list: fetched ?? (updated ? undefined : saved?.list) };
  if (list) setModelList(list);
  // One write, so every context sees the new list together with the choices moved onto it.
  await chrome.storage.local.set({
    [STORAGE_MODEL_LIST]: next,
    ...(list ? await migratedSelections(list) : {}),
  });
}

let pending = Promise.resolve();

// Runs one check at a time, so the startup check and the update check never race.
export const syncModelList = (updated = false) =>
  (pending = pending
    .then(() => checkModelList(updated))
    .catch((error) => errorLog('Model list check failed:', error)));
