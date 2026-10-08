import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from 'jotai';

const temporary = fileURLToPath(new URL(`../.wxt/model-preferences-${randomUUID()}.mjs`, import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/lib/modelPreferences.ts', import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
after(() => rm(temporary, { force: true }));
const { rememberProviderModels: remember, resolveProviderModels: resolve, isProviderModel, registeredAIProviders, resolveChatGPTSignOut } = await import(pathToFileURL(temporary).href);
const catalogs = {
  chatGPT: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-luna' }, { id: 'custom-model' }],
  local: [{ id: 'local-one' }, { id: 'local-two' }],
};
const empty = { selections: {} };
const apiSelection = { chat: 'claude-sonnet', translation: 'gemini-flash-lite' };
const chatGPTSelection = { chat: 'chatgpt:custom-model', translation: 'chatgpt:gpt-6.1-sol' };

test('provider history records actual switches and stays stable when model choices change', () => {
  let preferences = remember(empty, 'openrouter-api-key', apiSelection);
  preferences = remember(preferences, 'gemini-api-key', { chat: 'gemini-flash', translation: 'gemini-flash-lite' });
  preferences = remember(preferences, 'chatgpt', chatGPTSelection);
  preferences = remember(preferences, 'chatgpt', { ...chatGPTSelection, translation: 'chatgpt:gpt-6-luna' });
  assert.deepEqual(preferences.recentProviders, ['chatgpt', 'gemini-api-key', 'openrouter-api-key']);
});

test('logout restores the most recent registered provider and its saved model pair', () => {
  let preferences = remember(empty, 'openrouter-api-key', apiSelection);
  preferences = remember(preferences, 'gemini-api-key', { chat: 'gemini-flash', translation: 'gemini-flash-lite' });
  preferences = remember(preferences, 'chatgpt', chatGPTSelection);
  const result = resolveChatGPTSignOut(preferences, chatGPTSelection, ['openrouter-api-key', 'gemini-api-key'], catalogs);
  assert.equal(result.provider, 'gemini-api-key');
  assert.deepEqual(result.selection, { chat: 'gemini-flash', translation: 'gemini-flash-lite' });
  assert.deepEqual(result.preferences.selections.chatgpt, chatGPTSelection);
  assert.equal(result.preferences.provider, 'gemini-api-key');
  const onlyRouter = resolveChatGPTSignOut(preferences, chatGPTSelection, ['openrouter-api-key'], catalogs);
  assert.equal(onlyRouter.provider, 'openrouter-api-key');
  assert.deepEqual(onlyRouter.selection, apiSelection);
});

test('logout uses available provider defaults when saved models cannot run', () => {
  const preferences = remember(remember(empty, 'gemini-api-key', apiSelection), 'chatgpt', chatGPTSelection);
  const result = resolveChatGPTSignOut(preferences, chatGPTSelection, ['gemini-api-key'], catalogs);
  assert.deepEqual(result.selection, { chat: 'gemini-flash', translation: 'gemini-flash-lite' });
  const firstUse = resolveChatGPTSignOut(empty, chatGPTSelection, ['anthropic-api-key'], catalogs);
  assert.deepEqual(firstUse.selection, { chat: 'claude-sonnet', translation: 'claude-haiku' });
});

test('logout can return to a local model and replaces models removed from its catalog', () => {
  const preferences = remember(remember(empty, 'local', { chat: 'local:gone', translation: 'local:local-two' }), 'chatgpt', chatGPTSelection);
  const result = resolveChatGPTSignOut(preferences, chatGPTSelection, ['local'], catalogs);
  assert.equal(result.provider, 'local');
  assert.deepEqual(result.selection, { chat: 'local:local-one', translation: 'local:local-two' });
});

test('provider availability excludes missing or invalid keys and empty local catalogs', () => {
  assert.deepEqual(registeredAIProviders({
    'openrouter-api-key': 'synthetic-key', 'openai-api-key': ' ',
    'gemini-api-key': 'synthetic-key', 'anthropic-api-key': 'synthetic-key',
  }, { 'openai-api-key': true, 'gemini-api-key': false }, []), ['openrouter-api-key', 'anthropic-api-key']);
  assert.deepEqual(registeredAIProviders({}, {}, catalogs.local), ['local']);
});

test('logout with no remaining provider preserves ChatGPT preferences for later onboarding', () => {
  const result = resolveChatGPTSignOut(remember(empty, 'chatgpt', chatGPTSelection), chatGPTSelection, [], catalogs);
  assert.equal(result.provider, null);
  assert.deepEqual(result.selection, {});
  assert.deepEqual(result.preferences.selections.chatgpt, chatGPTSelection);
});

test('older preferences without provider history can still restore a registered provider', () => {
  const result = resolveChatGPTSignOut({ provider: 'chatgpt', selections: { 'openrouter-api-key': apiSelection, chatgpt: chatGPTSelection } }, chatGPTSelection, ['openrouter-api-key'], catalogs);
  assert.equal(result.provider, 'openrouter-api-key');
  assert.deepEqual(result.selection, apiSelection);
});

test('ChatGPT and OpenRouter restore their separate chat and translation choices across repeated switches', () => {
  let preferences = remember(empty, 'openrouter-api-key', apiSelection);
  assert.deepEqual(resolve('chatgpt', apiSelection, undefined, catalogs), { chat: 'chatgpt:gpt-6.1-sol', translation: 'chatgpt:gpt-6-luna' });
  preferences = remember(preferences, 'chatgpt', chatGPTSelection);
  // Persisted preferences must also work after reopening the extension.
  preferences = JSON.parse(JSON.stringify(preferences));
  for (let i = 0; i < 3; i++) {
    const api = resolve('openrouter-api-key', chatGPTSelection, preferences.selections['openrouter-api-key'], catalogs);
    assert.deepEqual(api, apiSelection);
    preferences = remember(preferences, 'openrouter-api-key', api);
    const chatGPT = resolve('chatgpt', api, preferences.selections.chatgpt, catalogs);
    assert.deepEqual(chatGPT, chatGPTSelection);
    preferences = remember(preferences, 'chatgpt', chatGPT);
  }
});

test('a provider without saved choices uses its existing defaults when the current models disappear', () => {
  for (const [provider, expected] of [
    ['openrouter-api-key', { chat: 'gpt', translation: 'gpt-mini' }],
    ['openai-api-key', { chat: 'gpt', translation: 'gpt-mini' }],
    ['gemini-api-key', { chat: 'gemini-flash', translation: 'gemini-flash-lite' }],
    ['anthropic-api-key', { chat: 'claude-sonnet', translation: 'claude-haiku' }],
    ['local', { chat: 'local:local-one', translation: 'local:local-one' }],
  ]) assert.deepEqual(resolve(provider, chatGPTSelection, undefined, catalogs), expected);
});

test('switching providers with the same model list preserves the current choices', () => {
  assert.deepEqual(resolve('gemini-api-key', apiSelection, { chat: 'gpt', translation: 'gpt-mini' }, catalogs), apiSelection);
});

test('only the disappearing selection is restored; the other selection stays unchanged', () => {
  assert.deepEqual(resolve('openrouter-api-key', { chat: 'gpt', translation: 'chatgpt:gpt-6-luna' }, apiSelection, catalogs), {
    chat: 'gpt', translation: 'gemini-flash-lite',
  });
});

test('a model removed from a refreshed catalog falls back, while a still-valid saved model is restored', () => {
  assert.deepEqual(resolve('chatgpt', apiSelection, chatGPTSelection, { ...catalogs, chatGPT: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6-luna' }] }), {
    chat: 'chatgpt:gpt-6.1-sol', translation: 'chatgpt:gpt-6.1-sol',
  });
  assert.deepEqual(resolve('local', chatGPTSelection, { chat: 'local:removed', translation: 'local:local-two' }, catalogs), {
    chat: 'local:local-one', translation: 'local:local-two',
  });
});

test('a temporarily empty ChatGPT catalog preserves saved choices without inventing unavailable defaults', () => {
  const offline = { chatGPT: [], local: [] };
  assert.deepEqual(resolve('chatgpt', apiSelection, chatGPTSelection, offline), chatGPTSelection);
  assert.deepEqual(resolve('chatgpt', apiSelection, undefined, offline), { chat: undefined, translation: undefined });
});

test('excluded ChatGPT models cannot return through defaults or saved selections, even while offline', () => {
  const excluded = ['gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-luna'];
  const accountCatalog = { ...catalogs, chatGPT: [...excluded.map(id => ({ id })), ...catalogs.chatGPT] };
  const defaults = { chat: 'chatgpt:gpt-6.1-sol', translation: 'chatgpt:gpt-6-luna' };
  assert.deepEqual(resolve('chatgpt', apiSelection, undefined, accountCatalog), defaults);
  for (const id of excluded) {
    const selection = { chat: `chatgpt:${id}`, translation: `chatgpt:${id}` };
    assert.equal(isProviderModel('chatgpt', selection.chat), false);
    assert.deepEqual(resolve('chatgpt', selection, selection, accountCatalog), defaults);
    assert.deepEqual(resolve('chatgpt', selection, selection, { chatGPT: [], local: [] }), { chat: undefined, translation: undefined });
  }
  assert.equal(isProviderModel('chatgpt', 'chatgpt:gpt-6.1-sol'), true);
  assert.equal(isProviderModel('chatgpt', 'chatgpt:gpt-6-luna'), true);
  assert.deepEqual(resolve('chatgpt', apiSelection, undefined, { chatGPT: excluded.map(id => ({ id })), local: [] }), { chat: undefined, translation: undefined });
});

test('transient models from the other provider cannot erase a remembered selection', () => {
  const preferences = remember(empty, 'chatgpt', chatGPTSelection);
  assert.equal(remember(preferences, 'chatgpt', apiSelection), preferences);
  assert.equal(remember(preferences, 'chatgpt', chatGPTSelection), preferences);
});

test('provider preferences persist in Chrome local storage without replacing existing model settings', async () => {
  const originalChrome = globalThis.chrome;
  const data = { CHAT_MODEL: apiSelection.chat, TRANSLATE_MODEL: apiSelection.translation };
  globalThis.chrome = { storage: {
    local: {
      get: async key => Object.hasOwn(data, key) ? { [key]: structuredClone(data[key]) } : {},
      set: async values => Object.assign(data, structuredClone(values)),
    },
    onChanged: { addListener() {}, removeListener() {} },
  } };
  const hooksFile = fileURLToPath(new URL(`../.wxt/model-preferences-storage-${randomUUID()}.mjs`, import.meta.url));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../src/hooks/models.ts', import.meta.url))], outfile: hooksFile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const hooks = await import(pathToFileURL(hooksFile).href);
    const store = createStore();
    assert.deepEqual(await store.get(hooks.providerModelPreferencesAtom), empty);
    assert.equal(await store.get(hooks.chatModelAtom), apiSelection.chat);
    assert.equal(await store.get(hooks.translateModelAtom), apiSelection.translation);
    const preferences = remember(remember(empty, 'openrouter-api-key', apiSelection), 'chatgpt', chatGPTSelection);
    await store.set(hooks.providerModelPreferencesAtom, preferences);
    const reloaded = await import(pathToFileURL(hooksFile).href + '?reloaded');
    assert.deepEqual(await createStore().get(reloaded.providerModelPreferencesAtom), preferences);
    assert.equal(data.CHAT_MODEL, apiSelection.chat);
    assert.equal(data.TRANSLATE_MODEL, apiSelection.translation);
  } finally {
    globalThis.chrome = originalChrome;
    await rm(hooksFile, { force: true });
  }
});

test('the saved GPT slot calls GPT-6.1 Sol with supported fast reasoning on both API routes', async () => {
  const modelsFile = fileURLToPath(new URL(`../.wxt/model-routing-${randomUUID()}.mjs`, import.meta.url));
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../src/lib/models.ts', import.meta.url))], outfile: modelsFile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const { getModelInstance } = await import(pathToFileURL(modelsFile).href);
    for (const connectionMode of ['direct', 'openrouter']) {
      const modelPreset = { modelName: 'gpt', connectionMode, openaiKey: 'synthetic-key', openrouterKey: 'synthetic-key' };
      const model = getModelInstance({ modelPreset, fast: true, temperature: 0.3, maxTokens: 2000, jsonSchema: { type: 'object' } });
      const params = model.invocationParams();
      assert.equal(params.model, connectionMode === 'direct' ? 'gpt-6.1-sol' : 'openai/gpt-6.1-sol');
      assert.equal(connectionMode === 'direct' ? params.reasoning_effort : params.reasoning.effort, 'low');
      assert.equal(params.temperature, undefined);
      assert.deepEqual(params.response_format, { type: 'json_object' });
      if (connectionMode === 'direct') assert.equal(params.max_completion_tokens, 2000);
      const normal = getModelInstance({ modelPreset }).invocationParams();
      assert.equal(normal.reasoning_effort, undefined);
      assert.equal(normal.reasoning, undefined);
      const luna = getModelInstance({ modelPreset: { ...modelPreset, modelName: 'gpt-mini' }, fast: true }).invocationParams();
      assert.equal(connectionMode === 'direct' ? luna.reasoning_effort : luna.reasoning.effort, 'none');
    }
  } finally { await rm(modelsFile, { force: true }); }
});
