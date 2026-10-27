import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = fileURLToPath(new URL(`../.wxt/model-list-${randomUUID()}.mjs`, import.meta.url));
const LIST_URL = 'http://127.0.0.1:9/models/v1.json';
// One bundle, so the sync, the storage watcher and the lookups share the current list.
await build({
  stdin: {
    contents: ['lib/modelList.ts', 'lib/modelListStorage.ts', 'lib/modelPreferences.ts', 'lib/modelRegistry.ts', 'services/background/modelListSync.ts']
      .map((file) => `export * from './src/${file}';`).join('\n'),
    resolveDir: root,
    loader: 'ts',
  },
  outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
  define: { 'import.meta.env.WXT_MODEL_LIST_URL': JSON.stringify(LIST_URL) },
});
after(() => rm(temporary, { force: true }));
const {
  parseModelList, bundledModelList, getModelList, setModelList, watchModelList, syncModelList,
  migrateModelSelections, isChatModel, isSelectableChatGPTModelId, chatGPTFastEffort, getModelSpec, MAX_MODEL_LIST_CHARS,
} = await import(pathToFileURL(temporary).href);
const file = JSON.parse(await readFile(new URL('../site/models/v1.json', import.meta.url), 'utf8'));
const variant = (change) => { const copy = structuredClone(file); change(copy); return copy; };
const model = (copy, slot) => copy.models.find((entry) => entry.slot === slot);

// chrome.storage.local with change events, and fetch answering from `served`.
const storage = {};
const changeListeners = [];
let served;
const requests = [];
globalThis.chrome = { storage: {
  local: {
    get: async (keys) => Object.fromEntries([keys].flat().filter((key) => key in storage).map((key) => [key, structuredClone(storage[key])])),
    set: async (values) => {
      const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: storage[key], newValue: structuredClone(value) }]));
      Object.assign(storage, structuredClone(values));
      changeListeners.forEach((listener) => listener(changes, 'local'));
    },
  },
  onChanged: { addListener: (listener) => changeListeners.push(listener) },
} };
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  if (served instanceof Error) throw served;
  return new Response(typeof served === 'string' ? served : JSON.stringify(served), { status: served === undefined ? 404 : 200 });
};
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  requests.length = 0;
  served = undefined;
  setModelList(bundledModelList);
});

test('the deployed file passes as is, keeping every value it holds', () => {
  assert.deepEqual(parseModelList(file), {
    schema: 1, models: file.models, defaults: file.defaults, successors: file.successors, chatgpt: file.chatgpt,
  });
  assert.deepEqual(bundledModelList, parseModelList(file));
  assert.deepEqual(parseModelList(bundledModelList), bundledModelList);
  assert.equal(getModelSpec('gpt-terra').id, 'gpt-6.1-terra');
  assert.equal(isSelectableChatGPTModelId('gpt-5.6-terra'), false);
  assert.equal(chatGPTFastEffort('gpt-6-astra'), 'low');
  assert.equal(chatGPTFastEffort('gpt-6.1-terra'), 'none');
});

test('a file with any missing, unknown or out-of-range value is rejected whole', () => {
  const bad = {
    'a newer schema': (copy) => { copy.schema = 2; },
    'no models': (copy) => { copy.models = []; },
    'a repeated slot': (copy) => { copy.models.push(structuredClone(copy.models[0])); },
    'a slot that looks like a ChatGPT choice': (copy) => { copy.models[0].slot = 'chatgpt:gpt'; },
    'an effort the code cannot send': (copy) => { copy.models[0].openrouter.fastEffort = 'medium'; },
    'an OpenAI effort on a Gemini model': (copy) => { model(copy, 'gemini-flash').openaiFastEffort = 'low'; },
    'an id that changes the request path': (copy) => { model(copy, 'gemini-flash').id = '../files/x'; },
    'an unknown provider': (copy) => { model(copy, 'deepseek-pro').provider = 'deepseek-api-key'; },
    'a string where a flag belongs': (copy) => { copy.models[0].supportsImages = 'yes'; },
    'a label with a control character': (copy) => { copy.models[0].label = 'GPT\u0007'; },
    'a missing OpenRouter id': (copy) => { delete copy.models[0].openrouter.id; },
    'a default slot the list lacks': (copy) => { copy.defaults['openai-api-key'].chat = 'gpt-7'; },
    'a default the provider key cannot run': (copy) => { copy.defaults['gemini-api-key'].chat = 'gpt'; },
    'a missing provider default': (copy) => { delete copy.defaults['anthropic-api-key']; },
    'a successor the list lacks': (copy) => { copy.successors = { 'gpt-old': 'gpt-7' }; },
    'a successor for a slot still listed': (copy) => { copy.successors = { gpt: 'gpt-mini' }; },
    'a ChatGPT successor that is hidden': (copy) => { copy.chatgpt.successors['gpt-6-sol'] = 'gpt-5.6-sol'; },
    'a ChatGPT effort the code cannot send': (copy) => { copy.chatgpt.fastEffort['gpt-6-astra'] = 'max'; },
  };
  for (const [name, change] of Object.entries(bad)) assert.equal(parseModelList(variant(change)), undefined, name);
  for (const value of [null, [], 'text', 1, { ...file, models: 'gpt' }]) assert.equal(parseModelList(value), undefined);
});

test('unknown fields are dropped, and optional sections may be left out', () => {
  const parsed = parseModelList(variant((copy) => {
    copy.extra = { run: 'code' };
    copy.models[0].baseUrl = 'https://example.com';
    copy.models[0].openrouter.provider = { only: ['x'] };
    delete copy.successors;
    delete copy.chatgpt;
  }));
  assert.equal('extra' in parsed, false);
  assert.equal('baseUrl' in parsed.models[0], false);
  assert.deepEqual(parsed.models[0].openrouter, file.models[0].openrouter);
  assert.deepEqual(parsed.successors, {});
  assert.deepEqual(parsed.chatgpt, { hidden: [], successors: {}, fastEffort: {} });
});

// gpt-mini repointed and relabeled, gemma dropped for gemini-flash-lite, claude-haiku dropped without a successor.
const remote = variant((copy) => {
  model(copy, 'gpt-mini').label = 'GPT-6.1 Luna';
  model(copy, 'gpt-mini').id = 'gpt-6.1-luna';
  copy.models = copy.models.filter(({ slot }) => slot !== 'gemma' && slot !== 'claude-haiku');
  copy.models.push({ ...structuredClone(model(copy, 'gemini-flash')), slot: 'gemini-pro', id: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro' });
  copy.defaults['anthropic-api-key'].translation = 'claude-sonnet';
  copy.successors = { gemma: 'gemini-flash-lite' };
});

test('saved choices move off dropped slots to their successor, else to the provider default', () => {
  const list = parseModelList(remote);
  assert.deepEqual(migrateModelSelections(list, {
    chat: 'gemma',
    translation: 'claude-haiku',
    preferences: { provider: 'anthropic-api-key', selections: {
      'gemini-api-key': { chat: 'gemma', translation: 'gemini-flash-lite' },
      'anthropic-api-key': { chat: 'claude-sonnet', translation: 'claude-haiku' },
      'openrouter-api-key': { chat: 'gpt-mini', translation: 'gpt' },
      chatgpt: { chat: 'chatgpt:gpt-5.6-terra', translation: 'chatgpt:gpt-6-luna' },
      local: { chat: 'local:gemma', translation: 'local:gemma' },
    } },
  }), {
    chat: 'gemini-flash-lite',
    translation: 'claude-sonnet',
    preferences: { provider: 'anthropic-api-key', selections: {
      'gemini-api-key': { chat: 'gemini-flash-lite', translation: 'gemini-flash-lite' },
      'anthropic-api-key': { chat: 'claude-sonnet', translation: 'claude-sonnet' },
      'openrouter-api-key': { chat: 'gpt-mini', translation: 'gpt' },
      chatgpt: { chat: 'chatgpt:gpt-6.1-terra', translation: 'chatgpt:gpt-6-luna' },
      local: { chat: 'local:gemma', translation: 'local:gemma' },
    } },
  });
  assert.deepEqual(migrateModelSelections(list, { chat: 'gpt-mini', translation: 'local:x', preferences: { selections: {} } }), {});
  // Settings saved before providers were remembered fall back to the OpenAI defaults.
  assert.deepEqual(migrateModelSelections(list, { chat: 'claude-haiku' }), { chat: 'gpt' });
  assert.deepEqual(migrateModelSelections(list, { chat: 'chatgpt:gpt-6-sol' }), { chat: 'chatgpt:gpt-6.1-sol' });
});

test('a first check fetches the list, saves it with the moved choices in one write, and applies it', async () => {
  served = remote;
  Object.assign(storage, { CHAT_MODEL: 'gemma', TRANSLATE_MODEL: 'gpt-mini', PROVIDER_MODEL_PREFERENCES: { provider: 'gemini-api-key', selections: { 'gemini-api-key': { chat: 'gemma', translation: 'gemini-flash-lite' } } } });
  const writes = [];
  changeListeners.push((changes) => writes.push(Object.keys(changes).sort()));
  await syncModelList();
  changeListeners.pop();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, LIST_URL);
  assert.equal(requests[0].options.credentials, 'omit');
  assert.deepEqual(writes, [['CHAT_MODEL', 'MODEL_LIST', 'PROVIDER_MODEL_PREFERENCES']]);
  assert.deepEqual(storage.MODEL_LIST.list, parseModelList(remote));
  assert.equal(storage.CHAT_MODEL, 'gemini-flash-lite');
  assert.equal(storage.TRANSLATE_MODEL, 'gpt-mini');
  assert.deepEqual(storage.PROVIDER_MODEL_PREFERENCES.selections['gemini-api-key'], { chat: 'gemini-flash-lite', translation: 'gemini-flash-lite' });
  assert.equal(getModelSpec('gpt-mini').id, 'gpt-6.1-luna');
  assert.equal(isChatModel('gemma'), false);
  assert.equal(isChatModel('gemini-pro'), true);
});

test('a list checked within the day is not fetched again', async () => {
  storage.MODEL_LIST = { checkedAt: Date.now() - DAY + 60_000, list: parseModelList(remote) };
  served = file;
  await syncModelList();
  assert.equal(requests.length, 0);
});

test('a failed, invalid or oversized fetch keeps the saved list and waits another day', async () => {
  const saved = parseModelList(remote);
  for (const response of [new Error('offline'), undefined, '{"schema":1,', variant((copy) => { copy.schema = 2; }), ' '.repeat(MAX_MODEL_LIST_CHARS + 1)]) {
    storage.MODEL_LIST = { checkedAt: Date.now() - DAY - 1, list: saved };
    storage.CHAT_MODEL = 'gemini-pro';
    served = response;
    await syncModelList();
    assert.deepEqual(storage.MODEL_LIST.list, saved);
    assert.ok(Date.now() - storage.MODEL_LIST.checkedAt < 1000);
    assert.equal(storage.CHAT_MODEL, 'gemini-pro');
  }
});

test('after an update the list is fetched at once, and a failed fetch falls back to the bundled list', async () => {
  storage.MODEL_LIST = { checkedAt: Date.now(), list: parseModelList(remote) };
  storage.CHAT_MODEL = 'gemini-pro';
  setModelList(parseModelList(remote));
  served = new Error('offline');
  await syncModelList(true);
  assert.equal(requests.length, 1);
  assert.equal(storage.MODEL_LIST.list, undefined);
  assert.equal(getModelList(), bundledModelList);
  assert.equal(storage.CHAT_MODEL, 'gpt');
});

test('each context reads the saved list, checks it again, and follows later saves', async () => {
  storage.MODEL_LIST = { checkedAt: Date.now(), list: parseModelList(remote) };
  await watchModelList();
  assert.equal(getModelSpec('gpt-mini').id, 'gpt-6.1-luna');
  // A saved list the current rules reject, e.g. after an update, gives way to the bundled one.
  await chrome.storage.local.set({ MODEL_LIST: { checkedAt: Date.now(), list: variant((copy) => { copy.models[0].openrouter.fastEffort = 'medium'; }) } });
  assert.equal(getModelList(), bundledModelList);
  await chrome.storage.local.set({ MODEL_LIST: { checkedAt: Date.now(), list: parseModelList(remote) } });
  assert.equal(getModelSpec('gemini-pro').label, 'Gemini 3.8 Pro');
});
