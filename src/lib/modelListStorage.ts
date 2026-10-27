import { STORAGE_MODEL_LIST } from '@/config/constants';
import { bundledModelList, parseModelList, setModelList, type ModelList } from '@/lib/modelList';

// What the background saves after each check. `list` is the last fetched list that passed
// parseModelList; it is checked again when read, since an update may have changed the rules.
export interface SavedModelList {
  checkedAt: number;
  list?: ModelList;
}

const apply = (saved: unknown) =>
  setModelList(parseModelList((saved as SavedModelList | undefined)?.list) ?? bundledModelList);

let loaded: Promise<void> | undefined;

// Uses the saved list in this context and follows later saves. Safe to call more than once.
export const watchModelList = () =>
  (loaded ??= (() => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_MODEL_LIST]) apply(changes[STORAGE_MODEL_LIST].newValue);
    });
    return chrome.storage.local.get(STORAGE_MODEL_LIST).then((res) => apply(res[STORAGE_MODEL_LIST]));
  })());
