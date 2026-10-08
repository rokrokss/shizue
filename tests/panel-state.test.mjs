import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from 'jotai';
import { createThreadLoader } from '../src/lib/threadLoader.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(setImmediate);

async function withGlobalState(run) {
  const hydration = deferred(), listeners = new Set(), writes = [];
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: {
    local: {
      get: () => hydration.promise,
      set: async (value) => { writes.push(value.GLOBAL_STATE); },
    },
    onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
  } };
  const temporary = fileURLToPath(new URL(`../.wxt/panel-state-${randomUUID()}.mjs`, import.meta.url));
  let unsubscribe;
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../src/hooks/global.ts', import.meta.url))],
      outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const atoms = await import(pathToFileURL(temporary).href);
    const store = createStore();
    unsubscribe = store.sub(atoms.sidePanelHydratedAtom, () => {});
    await run({ atoms, store, hydration, writes, change(state) {
      for (const listener of listeners) listener({ GLOBAL_STATE: { newValue: state } }, 'local');
    } });
  } finally {
    unsubscribe?.();
    globalThis.chrome = previousChrome;
    await unlink(temporary);
  }
}

test('stored actions hydrate without restoring the previous panel selection', async () => {
  await withGlobalState(async ({ atoms, store, hydration }) => {
    assert.equal(store.get(atoms.sidePanelHydratedAtom), false);
    assert.equal(store.get(atoms.threadIdAtom), undefined);
    hydration.resolve({ GLOBAL_STATE: { actionType: 'askForSummary', threadId: 'saved-thread' } });
    await flush();
    assert.equal(store.get(atoms.sidePanelHydratedAtom), true);
    assert.equal(store.get(atoms.threadIdAtom), undefined);
    assert.equal(store.get(atoms.actionTypeAtom), 'askForSummary');
  });
});

test('action writes preserve stored fields while thread selection stays local', async () => {
  await withGlobalState(async ({ atoms, store, hydration, writes }) => {
    hydration.resolve({ GLOBAL_STATE: { actionType: 'askForSummary', threadId: 'saved-thread', summaryText: 'Page' } });
    await flush();
    await store.set(atoms.actionTypeAtom, 'chat');
    assert.deepEqual(writes.at(-1), { actionType: 'chat', threadId: 'saved-thread', summaryText: 'Page' });
    await store.set(atoms.threadIdAtom, 'selected-thread');
    assert.equal(store.get(atoms.threadIdAtom), 'selected-thread');
    assert.deepEqual(writes, [{ actionType: 'chat', threadId: 'saved-thread', summaryText: 'Page' }]);
  });
});

test('an action write during hydration waits for stored data without changing selection', async () => {
  await withGlobalState(async ({ atoms, store, hydration, writes }) => {
    store.set(atoms.threadIdAtom, 'new-thread');
    const write = store.set(atoms.actionTypeAtom, 'chat');
    assert.equal(writes.length, 0);
    hydration.resolve({ GLOBAL_STATE: { actionType: 'askForSummary', summaryText: 'Keep this' } });
    await write;
    await flush();
    assert.equal(store.get(atoms.threadIdAtom), 'new-thread');
    assert.deepEqual(writes, [{ actionType: 'chat', summaryText: 'Keep this' }]);
  });
});

test('a late hydration response cannot undo a newer storage event', async () => {
  await withGlobalState(async ({ atoms, store, hydration, change }) => {
    store.set(atoms.threadIdAtom, 'current-thread');
    change({ actionType: 'memo', threadId: 'other-panel-thread' });
    hydration.resolve({ GLOBAL_STATE: { actionType: 'chat', threadId: 'old-thread' } });
    await flush();
    assert.equal(store.get(atoms.threadIdAtom), 'current-thread');
    assert.equal(store.get(atoms.actionTypeAtom), 'memo');
    assert.equal(store.get(atoms.sidePanelHydratedAtom), true);
  });
});

test('reopening a panel starts a new chat and selections in separate panels are independent', async () => {
  await withGlobalState(async ({ atoms, store, hydration, writes }) => {
    hydration.resolve({ GLOBAL_STATE: { actionType: 'chat', threadId: 'legacy-thread' } });
    await flush();
    store.set(atoms.threadIdAtom, 'selected-thread');
    const reopened = createStore();
    assert.equal(reopened.get(atoms.threadIdAtom), undefined);
    reopened.set(atoms.threadIdAtom, 'another-thread');
    assert.equal(store.get(atoms.threadIdAtom), 'selected-thread');
    assert.equal(reopened.get(atoms.threadIdAtom), 'another-thread');
    assert.deepEqual(writes, []);
  });
});

test('a new thread loads immediately and an old response cannot replace it', async () => {
  const old = deferred(), current = deferred(), requests = [];
  const loader = createThreadLoader(id => { requests.push(id); return id === 'old' ? old.promise : current.promise; });
  const oldRead = loader.load('old');
  const currentRead = loader.load('current');
  assert.deepEqual(requests, ['old', 'current']);
  current.resolve(['Current chat']);
  assert.deepEqual(await currentRead, ['Current chat']);
  old.resolve(['Old chat']);
  assert.equal(await oldRead, undefined);
});

test('a summary saved during a read starts a new read without dropping the refresh', async () => {
  const before = deferred(), after = deferred();
  let count = 0;
  const loader = createThreadLoader(() => ++count === 1 ? before.promise : after.promise);
  const oldRead = loader.load('same-thread');
  const summaryRead = loader.load('same-thread');
  before.resolve(['Earlier messages']);
  assert.equal(await oldRead, undefined);
  after.resolve(['Earlier messages', 'Summarize page']);
  assert.deepEqual(await summaryRead, ['Earlier messages', 'Summarize page']);
});

test('unmounting, clearing a thread or starting a stream invalidates pending reads', async () => {
  const pending = deferred();
  const loader = createThreadLoader(() => pending.promise);
  const read = loader.load('previous');
  loader.invalidate();
  pending.resolve(['Obsolete content']);
  assert.equal(await read, undefined);
});

test('a failed read does not block the next selection', async () => {
  const loader = createThreadLoader(async id => {
    if (id === 'failed') throw new Error('Disconnected');
    return ['Current chat'];
  });
  await assert.rejects(loader.load('failed'), /Disconnected/);
  assert.deepEqual(await loader.load('current'), ['Current chat']);
});
