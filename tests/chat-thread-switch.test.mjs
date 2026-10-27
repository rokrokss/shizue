import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const sent = [];
globalThis.chrome = {
  runtime: { sendMessage: async (message) => void sent.push(message) },
  storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
};

// One bundle, so the test and the hooks share the same atoms.
const temporary = fileURLToPath(new URL(`../.wxt/chat-thread-switch-${randomUUID()}.mjs`, import.meta.url));
after(() => rm(temporary, { force: true }));
await build({
  stdin: {
    contents: `export * from '@/hooks/chat'; export { threadIdAtom } from '@/hooks/global'; export * from '@/config/constants';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
});
const { chatStatusAtom, switchThreadAtom, threadIdAtom, MESSAGE_CANCEL_NOT_STARTED_MESSAGE } =
  await import(pathToFileURL(temporary).href);
const { createStore } = await import('jotai');

let store;
beforeEach(() => {
  store = createStore();
  sent.length = 0;
});

test('switching while idle only changes the thread', () => {
  store.set(threadIdAtom, 'a');
  store.set(switchThreadAtom, 'b');
  assert.equal(store.get(threadIdAtom), 'b');
  store.set(switchThreadAtom, undefined);
  assert.equal(store.get(threadIdAtom), undefined);
  assert.equal(store.get(chatStatusAtom), 'idle');
  assert.deepEqual(sent, []);
});

test('leaving a thread while it answers stops the answer', () => {
  for (const next of ['b', undefined]) {
    store.set(threadIdAtom, 'a');
    store.set(chatStatusAtom, 'waiting');
    sent.length = 0;
    store.set(switchThreadAtom, next);
    assert.equal(store.get(threadIdAtom), next);
    assert.equal(store.get(chatStatusAtom), 'idle');
    assert.deepEqual(sent, [{ action: MESSAGE_CANCEL_NOT_STARTED_MESSAGE, threadId: 'a' }]);
  }
});

test('picking the thread already shown keeps its answer going', () => {
  store.set(threadIdAtom, 'a');
  store.set(chatStatusAtom, 'waiting');
  store.set(switchThreadAtom, 'a');
  // A first message is still creating its thread.
  store.set(threadIdAtom, undefined);
  store.set(switchThreadAtom, undefined);
  assert.equal(store.get(chatStatusAtom), 'waiting');
  assert.deepEqual(sent, []);
});
