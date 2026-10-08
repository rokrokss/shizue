import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { chromeStorageBackend } from './storageBackend';

export function atomWithChromeStorage<T>(key: string, initialValue: T) {
  const storage = chromeStorageBackend<T>();
  // Jotai's sync-storage overload can hold a promise as its value. This models
  // first-read hydration AND synchronous cached reads without lying about the
  // backend always returning a promise. Preserve the async write contract too.
  const stored = atomWithStorage<T | Promise<T>>(key, initialValue, {
    getItem: (name) => storage.getItem(name, initialValue),
    setItem: async (name, value) => storage.setItem(name, await value),
    removeItem: storage.removeItem,
    subscribe: (name, callback) => storage.subscribe(name, callback, initialValue),
  }, { getOnInit: true });
  return atom(
    (get) => {
      const value = get(stored);
      // An atom created during module preload can still hold its initial
      // promise. Read the hydrated snapshot before its very first subscription.
      return value instanceof Promise ? storage.getItem(key, initialValue) : value;
    },
    async (_get, set, update: Parameters<typeof stored.write>[2]) => {
      await set(stored, update);
    },
  );
}
