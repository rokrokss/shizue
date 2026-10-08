import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from 'jotai';
import { RESET } from 'jotai/utils';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function withStorage(run) {
  const previous = globalThis.chrome;
  const listeners = new Set(), reads = [], writes = [], removals = [];
  const chrome = { storage: { onChanged: {
    addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
  } } };
  for (const area of ['local', 'sync', 'session']) chrome.storage[area] = {
    get(key) { const request = { area, key, ...deferred() }; reads.push(request); return request.promise; },
    set(values) { const request = { area, values, ...deferred() }; writes.push(request); return request.promise; },
    remove(key) { const request = { area, key, ...deferred() }; removals.push(request); return request.promise; },
  };
  globalThis.chrome = chrome;
  const temporary = fileURLToPath(new URL(`../.wxt/panel-storage-${randomUUID()}.mjs`, import.meta.url));
  try {
    await build({ stdin: { contents: `export { chromeStorageBackend } from './src/lib/storageBackend';
      export { atomWithChromeStorage } from './src/lib/atomWithChromeStorage';`,
      resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
      outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const module = await import(pathToFileURL(temporary).href);
    await run({ ...module, reads, writes, removals, listeners,
      change(key, value, area = 'local') {
        for (const listener of listeners) listener({ [key]: { newValue: value } }, area);
      },
    });
  } finally {
    globalThis.chrome = previous;
    await unlink(temporary);
  }
}

test('concurrent storage reads share one request and become synchronous after hydration', async () => {
  await withStorage(async ({ chromeStorageBackend, reads, listeners }) => {
    const first = chromeStorageBackend(), second = chromeStorageBackend();
    const pending = first.getItem('SETTING', false);
    assert.strictEqual(second.getItem('SETTING', false), pending);
    assert.equal(reads.length, 1);
    reads[0].resolve({ SETTING: true });
    assert.equal(await pending, true);
    assert.equal(second.getItem('SETTING', false), true);
    assert.equal(reads.length, 1);
    assert.equal(listeners.size, 1);
  });
});

test('closed screens receive external changes and removal without another read', async () => {
  await withStorage(async ({ chromeStorageBackend, reads, change }) => {
    const storage = chromeStorageBackend(), seen = [];
    const pending = storage.getItem('SETTING', 'default');
    reads[0].resolve({ SETTING: 'first' }); await pending;
    const unsubscribe = storage.subscribe('SETTING', value => seen.push(value), 'default');
    change('SETTING', 'second');
    unsubscribe();
    change('SETTING', 'third');
    assert.equal(storage.getItem('SETTING', 'default'), 'third');
    change('SETTING', undefined);
    assert.equal(storage.getItem('SETTING', 'default'), 'default');
    assert.deepEqual(seen, ['second']);
    assert.equal(reads.length, 1);
  });
});

test('a late initial read or rejection cannot overwrite a newer storage event', async () => {
  for (const fail of [false, true]) await withStorage(async ({ chromeStorageBackend, reads, change }) => {
    const storage = chromeStorageBackend();
    const pending = storage.getItem('SETTING', false);
    change('SETTING', true);
    if (fail) reads[0].reject(new Error('Old read failed'));
    else reads[0].resolve({ SETTING: false });
    assert.equal(await pending, true);
    assert.equal(storage.getItem('SETTING', false), true);
  });
});

test('missing keys use each caller default while null, false and zero stay intact', async () => {
  await withStorage(async ({ chromeStorageBackend, reads, change }) => {
    const storage = chromeStorageBackend();
    const a = storage.getItem('SETTING', 'a'), b = storage.getItem('SETTING', 'b');
    reads[0].resolve({});
    assert.deepEqual(await Promise.all([a, b]), ['a', 'b']);
    for (const value of [null, false, 0]) {
      change('SETTING', value);
      assert.strictEqual(storage.getItem('SETTING', 'fallback'), value);
    }
  });
});

test('storage areas are isolated and failed reads can be retried', async () => {
  await withStorage(async ({ chromeStorageBackend, reads, change }) => {
    const local = chromeStorageBackend('local'), sync = chromeStorageBackend('sync');
    const a = local.getItem('SETTING', 'default'), b = sync.getItem('SETTING', 'default');
    reads[0].resolve({ SETTING: 'local' });
    reads[1].reject(new Error('Unavailable'));
    assert.equal(await a, 'local');
    await assert.rejects(b, /Unavailable/);
    const retry = sync.getItem('SETTING', 'default');
    reads[2].resolve({ SETTING: 'sync' }); await retry;
    change('SETTING', 'updated', 'local');
    assert.equal(local.getItem('SETTING', 'default'), 'updated');
    assert.equal(sync.getItem('SETTING', 'default'), 'sync');
  });
});

test('successful writes/removes update cached values even without change events', async () => {
  await withStorage(async ({ chromeStorageBackend, writes, removals }) => {
    const storage = chromeStorageBackend();
    const write = storage.setItem('SETTING', true);
    writes[0].resolve(); await write;
    assert.equal(storage.getItem('SETTING', false), true);
    const remove = storage.removeItem('SETTING');
    removals[0].resolve(); await remove;
    assert.equal(storage.getItem('SETTING', false), false);
  });
});

test('failed writes/removes leave the confirmed cache intact', async () => {
  await withStorage(async ({ chromeStorageBackend, reads, writes, removals }) => {
    const storage = chromeStorageBackend();
    const read = storage.getItem('SETTING', false);
    reads[0].resolve({ SETTING: true }); await read;
    const write = storage.setItem('SETTING', false);
    writes[0].reject(new Error('Quota')); await assert.rejects(write, /Quota/);
    const remove = storage.removeItem('SETTING');
    removals[0].reject(new Error('Unavailable')); await assert.rejects(remove, /Unavailable/);
    assert.equal(storage.getItem('SETTING', false), true);
  });
});

test('late write completions do not overwrite newer writes or external changes', async () => {
  await withStorage(async ({ chromeStorageBackend, writes, change }) => {
    const storage = chromeStorageBackend();
    const first = storage.setItem('SETTING', 'first');
    const second = storage.setItem('SETTING', 'second');
    writes[1].resolve(); await second;
    writes[0].resolve(); await first;
    assert.equal(storage.getItem('SETTING', ''), 'second');
    const third = storage.setItem('SETTING', 'third');
    change('SETTING', 'external');
    writes[2].resolve(); await third;
    assert.equal(storage.getItem('SETTING', ''), 'external');
  });
});

test('storage atoms reopen synchronously and still await persistence and RESET', async () => {
  await withStorage(async ({ atomWithChromeStorage, reads, writes, removals, change }) => {
    const setting = atomWithChromeStorage('SETTING', 'default');
    const store = createStore();
    let unsubscribe = store.sub(setting, () => {});
    const hydration = store.get(setting);
    reads[0].resolve({ SETTING: 'first' }); await hydration;
    unsubscribe();
    change('SETTING', 'second');
    unsubscribe = store.sub(setting, () => {});
    assert.equal(store.get(setting), 'second');
    assert.equal(reads.length, 1);
    let persisted = false;
    const write = store.set(setting, 'third').then(() => { persisted = true; });
    await Promise.resolve();
    assert.equal(persisted, false);
    assert.equal(store.get(setting), 'third');
    writes[0].resolve(); await write;
    const reset = store.set(setting, RESET);
    removals[0].resolve(); await reset;
    assert.equal(store.get(setting), 'default');
    unsubscribe();
    const anotherStore = createStore();
    const stop = anotherStore.sub(setting, () => {});
    assert.equal(anotherStore.get(setting), 'default');
    assert.equal(reads.length, 1);
    stop();
  });
});

test('preloaded atoms use hydrated values on their first render without suspending', async () => {
  await withStorage(async ({ atomWithChromeStorage, chromeStorageBackend, reads }) => {
    const setting = atomWithChromeStorage('SETTING', 'default');
    const hydration = chromeStorageBackend().getItem('SETTING', 'default');
    reads[0].resolve({ SETTING: 'ready' });
    await hydration;
    assert.equal(createStore().get(setting), 'ready');
    assert.equal(reads.length, 1);
  });
});
