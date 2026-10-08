import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

async function withModule(entry, chrome, run) {
  const temporary = fileURLToPath(new URL(`../.wxt/chatgpt-settings-${randomUUID()}.mjs`, import.meta.url));
  const originalChrome = globalThis.chrome;
  globalThis.chrome = chrome;
  try {
    await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    await run(await import(pathToFileURL(temporary).href));
  } finally { globalThis.chrome = originalChrome; await rm(temporary, { force: true }); }
}

// Stands in for the account backend (ChatGPTAuth): each operation waits for the test to reply.
function backendFixture(data = {}) {
  const requests = [], writes = [], pending = new Map();
  let nextId = 0;
  const request = (operation, accountId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    requests.push({ id, operation, accountId });
    pending.set(id, { resolve, reject });
  });
  return {
    requests, writes, data,
    reply: ({ id, result }) => pending.get(id)?.resolve(result),
    backend: {
      status: () => request('status'),
      signIn: (accountId) => request('signIn', accountId),
      signOut: (accountId) => request('signOut', accountId),
    },
    chrome: {
      tabs: { create: async () => {} },
      storage: { local: {
        get: async () => structuredClone(data),
        set: async (value) => { writes.push(value); Object.assign(data, structuredClone(value)); },
      } },
    },
  };
}

const withSettings = (fixture, run) => withModule('../src/services/background/chatgpt.ts', fixture.chrome,
  ({ chatGPTSettingsHandler }) => run(chatGPTSettingsHandler(() => fixture.backend)));

test('a missing background reply cannot leave a settings request pending forever', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reply;
  await withModule('../src/lib/chatgpt.ts', { runtime: { sendMessage: () => new Promise((resolve) => { reply = resolve; }) } }, async ({ chatGPTSettings }) => {
    const request = chatGPTSettings('status');
    const rejected = assert.rejects(request, (error) => error.code === 'request_timeout');
    t.mock.timers.tick(15_000);
    await rejected;
    // A late reply does not turn the timed-out request into a success.
    reply({ success: true, connection: { connected: true } });
    await assert.rejects(request, (error) => error.code === 'request_timeout');
  });
});

test('an older automatic status reply cannot overwrite the account just added', async () => {
  const fixture = backendFixture();
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const status = handleChatGPTSettings('status');
    const statusId = fixture.requests.at(-1).id;
    const signIn = handleChatGPTSettings('signIn');
    const signInId = fixture.requests.at(-1).id;
    const next = { connected: true, activeId: 'new-account', accounts: [], models: [] };
    fixture.reply({ id: signInId, result: next });
    assert.deepEqual(await signIn, next);
    fixture.reply({ id: statusId, result: { ...next, connected: false, activeId: null } });
    await status;
    assert.equal(fixture.writes.length, 1);
    assert.deepEqual(Object.values(fixture.writes[0]), [next]);
  });
});

test('a status check started during sign-in cannot replace the successful login', async () => {
  const fixture = backendFixture();
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const signIn = handleChatGPTSettings('signIn');
    const signInId = fixture.requests.at(-1).id;
    const status = handleChatGPTSettings('status');
    const statusId = fixture.requests.at(-1).id;
    const next = { connected: true, activeId: 'new-account', accounts: [], models: [] };
    fixture.reply({ id: signInId, result: next });
    await signIn;
    fixture.reply({ id: statusId, result: { ...next, connected: false, activeId: null } });
    await status;
    assert.equal(fixture.writes.length, 1);
    assert.deepEqual(Object.values(fixture.writes[0]), [next]);
  });
});

test('an older status reply cannot restore the account after logout', async () => {
  const fixture = backendFixture();
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const status = handleChatGPTSettings('status');
    const statusId = fixture.requests.at(-1).id;
    const logout = handleChatGPTSettings('signOut', 'saved-account');
    const request = fixture.requests.at(-1);
    assert.equal(request.operation, 'signOut');
    assert.equal(request.accountId, 'saved-account');
    const next = { connected: false, activeId: null, accounts: [{ id: 'saved-account', label: 'same@example.com', connected: false }], models: [] };
    fixture.reply({ id: request.id, result: next });
    assert.deepEqual(await logout, { ...next, requiresOnboarding: true });
    fixture.reply({ id: statusId, result: { ...next, activeId: 'saved-account', connected: true } });
    await status;
    assert.equal(fixture.writes.length, 1);
    assert.deepEqual(fixture.writes[0].CHATGPT_CONNECTION, next);
  });
});

test('account selection and deletion are no longer available through the settings bridge', async () => {
  const fixture = backendFixture();
  await withSettings(fixture, async (handleChatGPTSettings) => {
    await assert.rejects(handleChatGPTSettings('select', 'old-account'), /Unknown/);
    await assert.rejects(handleChatGPTSettings('removeAccount', 'old-account'), /Unknown/);
    assert.deepEqual(fixture.requests, []);
  });
});

test('logout publishes fallback provider, models, routing and account state together', async () => {
  const chatGPTSelection = { chat: 'chatgpt:gpt-6.1-sol', translation: 'chatgpt:gpt-6-luna' };
  const savedModels = { chat: 'claude-sonnet', translation: 'gemini-flash-lite' };
  const fixture = backendFixture({
    OPENROUTER_KEY: 'synthetic-key', OPENROUTER_VALIDATED: true,
    CHAT_MODEL: chatGPTSelection.chat, TRANSLATE_MODEL: chatGPTSelection.translation,
    PROVIDER_MODEL_PREFERENCES: { provider: 'chatgpt', recentProviders: ['chatgpt', 'openrouter-api-key'], selections: { 'openrouter-api-key': savedModels } },
  });
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const logout = handleChatGPTSettings('signOut', 'saved-account');
    const connection = { connected: false, activeId: null, accounts: [{ id: 'saved-account', label: 'same@example.com', connected: false }], models: [] };
    fixture.reply({ id: fixture.requests.at(-1).id, result: connection });
    assert.equal((await logout).requiresOnboarding, false);
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.data.PROVIDER_MODEL_PREFERENCES.provider, 'openrouter-api-key');
    assert.deepEqual(fixture.data.PROVIDER_MODEL_PREFERENCES.selections.chatgpt, chatGPTSelection);
    assert.equal(fixture.data.CHAT_MODEL, savedModels.chat);
    assert.equal(fixture.data.TRANSLATE_MODEL, savedModels.translation);
    assert.equal(fixture.data.CONNECTION_MODE, 'openrouter');
    assert.deepEqual(fixture.data.CHATGPT_CONNECTION, connection);
    assert.equal('requiresOnboarding' in fixture.data.CHATGPT_CONNECTION, false);
    assert.equal(fixture.data.OPENROUTER_KEY, 'synthetic-key');
  });
});

test('logout returns to onboarding when only invalid keys and a retained registration remain', async () => {
  const fixture = backendFixture({ OPENAI_KEY: 'invalid-key', OPENAI_VALIDATED: false, LOCAL_SERVER: { models: [] } });
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const logout = handleChatGPTSettings('signOut', 'saved-account');
    const connection = { connected: false, activeId: null, accounts: [{ id: 'saved-account', label: 'same@example.com', connected: false }], models: [] };
    fixture.reply({ id: fixture.requests.at(-1).id, result: connection });
    assert.equal((await logout).requiresOnboarding, true);
    assert.equal(fixture.data.CHATGPT_CONNECTION.accounts.length, 1);
    assert.equal(fixture.data.PROVIDER_MODEL_PREFERENCES.provider, 'chatgpt');
  });
});

test('logout awaiting saved providers cannot overwrite a newer login', async () => {
  const fixture = backendFixture();
  let release, started;
  const readStarted = new Promise(resolve => { started = resolve; });
  const read = new Promise(resolve => { release = resolve; });
  fixture.chrome.storage.local.get = async () => { started(); await read; return {}; };
  await withSettings(fixture, async (handleChatGPTSettings) => {
    const logout = handleChatGPTSettings('signOut', 'saved-account');
    fixture.reply({ id: fixture.requests.at(-1).id, result: { connected: false, activeId: null, accounts: [], models: [] } });
    await readStarted;
    const signIn = handleChatGPTSettings('signIn');
    const connected = { connected: true, activeId: 'saved-account', accounts: [], models: [] };
    fixture.reply({ id: fixture.requests.at(-1).id, result: connected });
    await signIn;
    release();
    await logout;
    assert.equal(fixture.writes.length, 1);
    assert.deepEqual(fixture.data.CHATGPT_CONNECTION, connected);
    assert.equal(fixture.data.PROVIDER_MODEL_PREFERENCES, undefined);
  });
});
