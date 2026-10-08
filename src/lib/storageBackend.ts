import { errorLog } from '@/logs';

type StorageArea = 'local' | 'sync' | 'session';

type Snapshot = {
  ready: boolean;
  value?: unknown;
  revision: number;
  write: number;
  pending?: Promise<void>;
  reads: Map<unknown, Promise<unknown>>;
  listeners: Set<() => void>;
};

// One cache per extension document/worker. Keep listening while a settings
// screen is unmounted so reopening it never needs another asynchronous read.
const snapshots = new Map<StorageArea, Map<string, Snapshot>>();
let listening = false;

function publish(snapshot: Snapshot, value: unknown) {
  snapshot.ready = true;
  snapshot.value = value;
  snapshot.revision++;
  for (const listener of snapshot.listeners) listener();
}

function getSnapshot(area: StorageArea, key: string): Snapshot {
  if (!listening) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      const entries = snapshots.get(namespace as StorageArea);
      for (const [changedKey, change] of Object.entries(changes)) {
        const snapshot = entries?.get(changedKey);
        if (snapshot) publish(snapshot, change.newValue);
      }
    });
    listening = true;
  }
  let entries = snapshots.get(area);
  if (!entries) snapshots.set(area, entries = new Map());
  let snapshot = entries.get(key);
  if (!snapshot) {
    snapshot = { ready: false, revision: 0, write: 0, reads: new Map(), listeners: new Set() };
    entries.set(key, snapshot);
  }
  return snapshot;
}

export const chromeStorageBackend = <T>(area: StorageArea = 'local') => {
  return {
    getItem(key: string, initialValue: T): T | Promise<T> {
      const snapshot = getSnapshot(area, key);
      const value = () => snapshot.value === undefined ? initialValue : snapshot.value as T;
      if (snapshot.ready) return value();
      if (!snapshot.pending) {
        const revision = snapshot.revision;
        snapshot.pending = chrome.storage[area].get(key).then((stored) => {
          // A storage event can arrive before an older get() reply.
          if (snapshot.revision === revision) publish(snapshot, stored[key]);
        }, (error) => {
          if (!snapshot.ready) throw error;
        }).finally(() => {
          snapshot.pending = undefined;
          snapshot.reads.clear();
        });
      }
      let read = snapshot.reads.get(initialValue) as Promise<T> | undefined;
      if (!read) {
        read = snapshot.pending.then(value);
        snapshot.reads.set(initialValue, read);
      }
      return read;
    },
    async setItem(key: string, value: T): Promise<void> {
      const snapshot = getSnapshot(area, key);
      const revision = snapshot.revision;
      const write = ++snapshot.write;
      await chrome.storage[area].set({ [key]: value });
      // Chrome normally emits onChanged first. Also cover successful no-op
      // writes, which may not emit, without overwriting a newer event/write.
      if (snapshot.revision === revision && snapshot.write === write) publish(snapshot, value);
    },
    async removeItem(key: string): Promise<void> {
      const snapshot = getSnapshot(area, key);
      const revision = snapshot.revision;
      const write = ++snapshot.write;
      await chrome.storage[area].remove(key);
      if (snapshot.revision === revision && snapshot.write === write) publish(snapshot, undefined);
    },
    subscribe(key: string, callback: (val: T) => void, initialValue: T) {
      const snapshot = getSnapshot(area, key);
      const handler = () => callback(snapshot.value === undefined ? initialValue : snapshot.value as T);
      snapshot.listeners.add(handler);
      return () => { snapshot.listeners.delete(handler); };
    },
  };
};

export async function readStorage<T>(
  key: string,
  area: StorageArea = 'local'
): Promise<T | undefined> {
  try {
    const result = await chrome.storage[area].get(key);
    return result?.[key];
  } catch (error) {
    errorLog(`Error reading ${area} storage key "${key}":`, error);
    return undefined;
  }
}

export async function setStorage<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<boolean> {
  try {
    await chrome.storage[area].set({ [key]: value });
    return true;
  } catch (error) {
    errorLog(`Error setting ${area} storage key "${key}":`, error);
    return false;
  }
}
