import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, jwtVerify } from 'jose';
import { chatGPTInput } from '../src/lib/chatgptInput.ts';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

async function load(entry) {
  const temporary = fileURLToPath(new URL(`../.wxt/chatgpt-${randomUUID()}.mjs`, import.meta.url));
  try {
    await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: temporary, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    return await import(pathToFileURL(temporary).href);
  } finally { await rm(temporary, { force: true }); }
}
const { ChatGPTAuth, StorageVault, callbackResult } = await load('../src/lib/chatgptAuth.ts');
const { responseEvents, visibleModels, readJSON, responseRequestBody } = await load('../src/lib/chatgptResponses.ts');

// chrome.storage.local stand-in.
const memoryVault = () => {
  const items = {};
  return new StorageVault({
    get: async (key) => ({ [key]: structuredClone(items[key]) }),
    set: async (values) => { Object.assign(items, structuredClone(values)); },
  }, 'CHATGPT_CREDENTIALS');
};

// Stands in for the background's redirect rule: the test delivers the callback URL that the
// browser would navigate to.
function testLoopback() {
  let receive;
  return {
    open: async (fn) => {
      receive = fn;
      return { redirectUri: `http://127.0.0.1:${49152 + Math.floor(Math.random() * 16384)}/auth/callback`, close: async () => { receive = undefined; } };
    },
    deliver: (url) => receive?.(new URL(url)) ?? false,
  };
}

test('OAuth callback binds state and the issued client ID, never the bootstrap ID', () => {
  const pending = { state: 'expected' };
  const url = new URL('http://127.0.0.1:1234/auth/callback?state=expected&code=code&client_id=oaiapp_new');
  assert.deepEqual(callbackResult(url, pending), { code: 'code', clientId: 'oaiapp_new' });
  assert.throws(() => callbackResult(url, { state: 'wrong' }), /state/);
  assert.throws(() => callbackResult(url, { ...pending, clientId: 'oaiapp_old' }), /different/);
  url.searchParams.delete('client_id');
  assert.throws(() => callbackResult(url, pending), /client ID/);
  assert.equal(callbackResult(url, { ...pending, clientId: 'oaiapp_old' }).clientId, 'oaiapp_old');
  url.searchParams.set('error', 'access_denied');
  assert.throws(() => callbackResult(url, pending), { code: 'access_denied' });
});

test('OIDC validation verifies signature, audience, nonce, expiry, subject and direct scope', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] });
  const auth = new ChatGPTAuth({}, { verify: (token, _keys, options) => jwtVerify(token, keys, options) });
  auth.oidc = { issuer: 'https://auth.openai.com' };
  const token = await new SignJWT({ nonce: 'nonce', email: 'user@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_client').setSubject('user-1').setExpirationTime('5m').sign(privateKey);
  const response = { access_token: 'secret', refresh_token: 'refresh', id_token: token, scope: 'openid chatgpt.tokens.use.direct', expires_in: 300 };
  assert.equal((await auth.validatedTokens(response, 'oaiapp_client', 'nonce')).identity.sub, 'user-1');
  await assert.rejects(auth.validatedTokens(response, 'oaiapp_other', 'nonce'), /aud/);
  await assert.rejects(auth.validatedTokens(response, 'oaiapp_client', 'wrong'), /nonce/);
  await assert.rejects(auth.validatedTokens(response, 'oaiapp_client', 'nonce', 'user-2'), /account changed/);
  await assert.rejects(auth.validatedTokens({ ...response, scope: 'openid' }, 'oaiapp_client', 'nonce'), { code: 'missing_plan_scope' });
  await assert.rejects(auth.validatedTokens({ ...response, id_token: `${token.slice(0, -12)}bad` }, 'oaiapp_client', 'nonce'));
  const expired = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_client').setSubject('user-1').setExpirationTime(1).sign(privateKey);
  await assert.rejects(auth.validatedTokens({ ...response, id_token: expired }, 'oaiapp_client', 'nonce'), /exp/);
});

test('rotating refresh tokens are serialized and saved; public status excludes credentials', async () => {
  const vault = memoryVault();
  await vault.locked((data) => {
    data.activeId = 'oaiapp_client';
    data.accounts.push({ clientId: data.activeId, subject: 'user', label: 'Account', tokens: { accessToken: 'old', refreshToken: 'old-refresh', scope: 'chatgpt.tokens.use.direct', expiresAt: 0 } });
  });
  let refreshes = 0;
  const auth = new ChatGPTAuth(vault, { fetch: async (url, options) => {
    if (String(url).endsWith('/oauth/token')) {
      refreshes++;
      assert.equal(options.body.get('client_id'), 'oaiapp_client');
      assert.equal(options.body.get('refresh_token'), 'old-refresh');
      assert.equal(options.body.has('scope'), false);
      return Response.json({ access_token: 'new-secret', refresh_token: 'new-refresh', expires_in: 3600, scope: 'chatgpt.tokens.use.direct' });
    }
    return Response.json({ models: [{ visibility: 'list', slug: 'model', display_name: 'Model' }] });
  } });
  auth.oidc = { issuer: 'https://auth.openai.com' };
  const sessions = await Promise.all([auth.access(), auth.access()]);
  assert.equal(refreshes, 1);
  assert.equal(sessions[0].accessToken, 'new-secret');
  assert.equal((await vault.read()).accounts[0].tokens.refreshToken, 'new-refresh');
  const publicStatus = JSON.stringify(await auth.status());
  assert.equal(publicStatus.includes('new-secret'), false);
  assert.equal(publicStatus.includes('new-refresh'), false);
});

function streamOf(events, terminate = true) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('');
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    // Exercise UTF-8 and CRLF boundaries independently of network packet boundaries.
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    if (terminate) controller.close();
  } });
}

test('Responses stream preserves deltas and terminal usage; late quota errors and interruptions fail', async () => {
  const usage = { input_tokens: 4, output_tokens: 2, total_tokens: 6 };
  const events = [];
  for await (const event of responseEvents(streamOf([{ type: 'response.output_text.delta', delta: '안녕🙂' }, { type: 'response.completed', response: { usage } }]))) events.push(event);
  assert.deepEqual(events, [{ delta: '안녕🙂' }, { usage }]);
  const collect = async (input) => { for await (const _event of responseEvents(input)) {} };
  await assert.rejects(collect(streamOf([{ type: 'response.output_text.delta', delta: 'partial' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])), { code: 'subscription_sharing_usage_limit_exceeded' });
  await assert.rejects(collect(streamOf([{ type: 'response.output_text.delta', delta: 'partial' }])), { code: 'stream_interrupted' });
  await assert.rejects(collect(streamOf([{ type: 'response.incomplete' }])), { code: 'response_incomplete' });
});

test('model catalog uses visibility and retains account-specific server order', () => {
  assert.deepEqual(visibleModels({ models: [{ slug: 'b', display_name: 'B', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }, { slug: 'a', display_name: 'A', visibility: 'list' }] }), [{ id: 'b', label: 'B' }, { id: 'a', label: 'A' }]);
});

test('Responses requests validate effort and retain the supported-field allowlist', () => {
  const input = [{ role: 'user', content: 'Translate Hello into Korean.' }];
  const base = { model: 'gpt-6.1-sol', input, instructions: 'Only return the translation.' };
  assert.deepEqual(responseRequestBody(base), { ...base, store: false, stream: true });
  for (const effort of ['low', 'none']) {
    assert.deepEqual(responseRequestBody({
      ...base, reasoning: { effort, mode: 'pro', summary: 'detailed' },
      temperature: 0.3, max_output_tokens: 2000, store: true, stream: false,
    }), { ...base, reasoning: { effort }, store: false, stream: true });
  }
  for (const reasoning of [null, false, 'low', [], {}, { effort: null }, { effort: 'high' }, { effort: 'invalid' }]) {
    assert.throws(() => responseRequestBody({ ...base, reasoning }), /Invalid ChatGPT reasoning effort/);
  }
  assert.throws(() => responseRequestBody({ ...base, input: 'plain string' }), /Invalid ChatGPT request/);
  assert.throws(() => responseRequestBody({ ...base, instructions: [] }), /Invalid ChatGPT request/);
});

test('existing chat history and images become Responses input with system instructions separate', () => {
  const input = chatGPTInput([new SystemMessage('Be helpful'), new HumanMessage({ content: [{ type: 'text', text: 'Describe' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }), new AIMessage('An image'), new HumanMessage('More detail')], true);
  assert.equal(input.input[0].role, 'user');
  assert.deepEqual(input.input[0].content, [{ type: 'input_text', text: 'Describe' }, { type: 'input_image', image_url: 'data:image/png;base64,AA==' }]);
  assert.deepEqual(input.input[1], { role: 'assistant', content: 'An image' });
  assert.deepEqual(input.input[2], { role: 'user', content: 'More detail' });
  assert.match(input.instructions, /Be helpful/);
  assert.match(input.instructions, /JSON object/);
  assert.equal(input.input.some((message) => message.role === 'system'), false);
});

test('loopback login uses PKCE, a stable host ID and the callback-issued client ID', async () => {
  const vault = memoryVault();
  const loopback = testLoopback();
  let authorize;
  let exchanges = 0;
  const auth = new ChatGPTAuth(vault, {
    loopback,
    verify: async (_token, _keys, options) => {
      assert.equal(options.audience, 'oaiapp_issued');
      return { payload: { sub: 'user', email: 'same@example.com', nonce: authorize.searchParams.get('nonce') } };
    },
    fetch: async (url, options) => {
      if (String(url).endsWith('/oauth/token')) {
        exchanges++;
        assert.equal(options.body.get('client_id'), 'oaiapp_issued');
        assert.equal(options.body.get('redirect_uri'), authorize.searchParams.get('redirect_uri'));
        const { createHash } = await import('node:crypto');
        assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
        return Response.json({ access_token: 'login-secret', refresh_token: 'refresh-secret', id_token: 'test-token', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' });
      }
      return Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] });
    },
  });
  auth.oidc = { issuer: 'https://auth.openai.com' };
  const connection = await auth.signIn(undefined, (event) => {
    authorize = new URL(event.authorizationUrl);
    assert.equal(authorize.origin, 'https://auth.openai.com');
    assert.equal(authorize.searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(authorize.searchParams.get('agent_name_hint'), 'Shizue');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(new URL(authorize.searchParams.get('redirect_uri')).hostname, '127.0.0.1');
    const callback = new URL(authorize.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'code', client_id: 'oaiapp_issued' });
    // A callback for another sign-in is ignored.
    assert.equal(loopback.deliver(`${callback.origin}${callback.pathname}?state=other&code=code`), false);
    assert.equal(loopback.deliver(callback), true);
  }, new AbortController().signal);
  assert.equal(exchanges, 1);
  assert.equal(connection.connected, true);
  assert.equal(connection.activeId, 'oaiapp_issued');
  assert.equal((await vault.read()).hostId, authorize.searchParams.get('ext_agent_host_id'));
  assert.equal(JSON.stringify(connection).includes('login-secret'), false);
  // Reconnect and sign in after sign-out both reuse the original registration.
  for (const retainedSession of [true, false]) {
    if (!retainedSession) await vault.locked((data) => {
      delete data.accounts[0].tokens;
      data.activeId = null;
    });
    const returning = await auth.signIn(undefined, (event) => {
      authorize = new URL(event.authorizationUrl);
      assert.equal(authorize.searchParams.get('client_id'), 'oaiapp_issued');
      assert.equal(authorize.searchParams.has('agent_name_hint'), false);
      assert.equal(authorize.searchParams.has('id_token_hint'), retainedSession);
      const callback = new URL(authorize.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'returning-code' });
      loopback.deliver(callback);
    }, new AbortController().signal);
    assert.equal(returning.activeId, 'oaiapp_issued');
    assert.equal(returning.accounts.length, 1);
    assert.equal((await vault.read()).hostId, authorize.searchParams.get('ext_agent_host_id'));
  }
  assert.equal(exchanges, 3);
});

test('sign-out clears tokens, retains registration and reports failed revocation', async () => {
  const vault = memoryVault();
  await vault.locked((data) => {
    data.activeId = 'oaiapp_issued';
    data.accounts.push({ clientId: data.activeId, subject: 'user', label: 'Account', tokens: { refreshToken: 'refresh-secret' } });
  });
  const auth = new ChatGPTAuth(vault, { fetch: async (_url, options) => {
    assert.equal(options.body.get('token_type_hint'), 'refresh_token');
    assert.equal(options.body.get('client_id'), 'oaiapp_issued');
    return new Response('', { status: 400 });
  } });
  auth.oidc = { issuer: 'https://auth.openai.com', revocation_endpoint: 'https://auth.openai.com/oauth/revoke' };
  const result = await auth.signOut('oaiapp_issued');
  assert.equal(result.revocationPending, true);
  assert.equal(result.activeId, null);
  const saved = await vault.read();
  assert.equal(saved.accounts[0].clientId, 'oaiapp_issued');
  assert.equal(saved.accounts[0].subject, 'user');
  assert.equal(saved.accounts[0].tokens, undefined);
});

test('malformed JSON never echoes credential contents into error replies', async () => {
  const malformed = '{"accessToken":"secret-value",BROKEN}';
  await assert.rejects(readJSON(new Response(malformed)), (error) => error.code === 'invalid_provider_response' && !error.message.includes('secret-value'));
});

async function withRegistrationFixture(run, accounts = [], revocationStatus = 200) {
  const vault = memoryVault();
  await vault.locked((data) => { data.accounts = structuredClone(accounts); data.activeId = accounts[0]?.clientId ?? null; });
  const revoked = [], authorizations = [];
  const register = async (clientId, subject, beforeCallback = async () => {}) => {
    let authorize;
    const loopback = testLoopback();
    const auth = new ChatGPTAuth(vault, {
      loopback,
      verify: async (_token, _keys, options) => {
        assert.equal(options.audience, clientId);
        return { payload: { sub: subject, email: 'same@example.com', nonce: authorize.searchParams.get('nonce') } };
      },
      fetch: async (url, options) => {
        if (String(url).endsWith('/oauth/token')) return Response.json({ access_token: `access-${clientId}`, refresh_token: `refresh-${clientId}`, id_token: 'synthetic-id', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' });
        if (String(url).endsWith('/oauth/revoke')) {
          revoked.push({ clientId: options.body.get('client_id'), token: options.body.get('token') });
          return new Response('', { status: revocationStatus });
        }
        return Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] });
      },
    });
    auth.oidc = { issuer: 'https://auth.openai.com', revocation_endpoint: 'https://auth.openai.com/oauth/revoke' };
    return auth.signIn(undefined, (event) => {
      authorize = new URL(event.authorizationUrl);
      authorizations.push(authorize);
      const callback = new URL(authorize.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'synthetic-code', client_id: clientId });
      void beforeCallback().then(() => loopback.deliver(callback));
    }, new AbortController().signal);
  };
  await run({ vault, revoked, register, authorizations });
}

const savedRegistration = {
  clientId: 'oaiapp_existing', subject: 'saved-user', label: 'same@example.com',
  tokens: { accessToken: 'existing-access', refreshToken: 'existing-refresh', scope: 'chatgpt.tokens.use.direct', expiresAt: Date.now() + 3_600_000 },
};

test('default sign-in reuses the saved registration instead of adding an account', async () => {
  await withRegistrationFixture(async ({ vault, register, revoked, authorizations }) => {
    const hostId = (await vault.read()).hostId;
    const result = await register(savedRegistration.clientId, savedRegistration.subject);
    assert.equal(result.accounts.length, 1);
    assert.equal(result.activeId, savedRegistration.clientId);
    assert.equal(authorizations[0].searchParams.get('client_id'), savedRegistration.clientId);
    assert.equal(authorizations[0].searchParams.get('ext_agent_host_id'), hostId);
    assert.equal(authorizations[0].searchParams.has('agent_name_hint'), false);
    assert.equal((await vault.read()).accounts.length, 1);
    assert.equal((await vault.read()).preferredAccountId, savedRegistration.clientId);
    assert.deepEqual(revoked, []);
  }, [savedRegistration]);
});

test('returning login cannot replace the registration client or its verified user', async () => {
  await withRegistrationFixture(async ({ vault, register, revoked }) => {
    const before = await vault.read();
    await assert.rejects(register('oaiapp_other', 'other-user'), /different application client ID/);
    await assert.rejects(register(savedRegistration.clientId, 'other-user'), /account changed/);
    assert.deepEqual(await vault.read(), before);
    assert.deepEqual(revoked, []);
  }, [savedRegistration]);
});

for (const secondUser of ['same-user', 'different-user']) {
  test(`simultaneous first sign-ins cannot save a second registration (${secondUser})`, async () => {
    await withRegistrationFixture(async ({ vault, register, revoked, authorizations }) => {
      let release, arrived = 0;
      const bothAuthorizing = new Promise(resolve => { release = resolve; });
      const barrier = async () => { if (++arrived === 2) release(); await bothAuthorizing; };
      const results = await Promise.allSettled([
        register('oaiapp_first', 'same-user', barrier),
        register('oaiapp_second', secondUser, barrier),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.code, 'account_already_registered');
      assert.ok(authorizations.every(url => url.searchParams.get('client_id') === 'dynamic_agent_client'));
      const saved = await vault.read();
      assert.equal(saved.accounts.length, 1);
      assert.equal(saved.activeId, saved.accounts[0].clientId);
      assert.equal(revoked.length, 1);
      assert.notEqual(revoked[0].clientId, saved.activeId);
    });
  });
}

test('a concurrent extra session reports unconfirmed revocation without replacing the saved connection', async () => {
  await withRegistrationFixture(async ({ vault, register, revoked }) => {
    let release, arrived = 0;
    const bothAuthorizing = new Promise(resolve => { release = resolve; });
    const barrier = async () => { if (++arrived === 2) release(); await bothAuthorizing; };
    const results = await Promise.allSettled([
      register('oaiapp_first', 'user-one', barrier),
      register('oaiapp_second', 'user-two', barrier),
    ]);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'duplicate_account_revocation_pending');
    const saved = await vault.read();
    assert.equal(saved.accounts.length, 1);
    assert.equal(revoked.length, 1);
    assert.notEqual(saved.activeId, revoked[0].clientId);
  }, [], 400);
});

async function withLegacyFixture(run, revocationStatus = 200) {
  const older = { ...structuredClone(savedRegistration), clientId: 'oaiapp_older', subject: 'older-user', tokens: { ...savedRegistration.tokens, refreshToken: 'older-refresh' } };
  const newer = { ...structuredClone(savedRegistration), clientId: 'oaiapp_newer', subject: 'newer-user', tokens: { ...savedRegistration.tokens, refreshToken: 'newer-refresh' } };
  await withRegistrationFixture(async ({ vault, register, authorizations }) => {
    await vault.locked(data => { data.activeId = savedRegistration.clientId; });
    const revoked = [];
    const auth = new ChatGPTAuth(vault, { fetch: async (url, options) => {
      if (String(url).endsWith('/oauth/revoke')) {
        revoked.push(options.body.get('client_id'));
        return new Response('', { status: revocationStatus });
      }
      return Response.json({ models: [{ slug: 'model', display_name: 'Model', visibility: 'list' }] });
    } });
    auth.oidc = { issuer: 'https://auth.openai.com', revocation_endpoint: 'https://auth.openai.com/oauth/revoke' };
    await run({ vault, auth, revoked, older, newer, register, authorizations });
  }, [older, savedRegistration, newer]);
}

test('legacy status exposes only the active account and never leaks identities or credentials', async () => {
  await withLegacyFixture(async ({ vault, auth }) => {
    const before = await vault.read();
    const result = await auth.status();
    assert.equal(result.activeId, savedRegistration.clientId);
    assert.deepEqual(result.accounts, [{ id: savedRegistration.clientId, label: savedRegistration.label, connected: true }]);
    const publicFields = JSON.stringify(result);
    for (const value of ['saved-user', 'existing-refresh', 'existing-access', 'oaiapp_older', 'oaiapp_newer']) {
      assert.equal(publicFields.includes(value), false);
    }
    assert.deepEqual(await vault.read(), before);
  });
});

test('logout remembers the active registration and never activates another legacy session', async () => {
  await withLegacyFixture(async ({ vault, auth, revoked, register, authorizations, older, newer }) => {
    const result = await auth.signOut();
    assert.equal(result.connected, false);
    assert.equal(result.activeId, null);
    assert.deepEqual(result.models, []);
    assert.deepEqual(result.accounts, [{ id: savedRegistration.clientId, label: savedRegistration.label, connected: false }]);
    const saved = await vault.read();
    assert.equal(saved.preferredAccountId, savedRegistration.clientId);
    assert.equal(saved.accounts[1].tokens, undefined);
    assert.deepEqual(saved.accounts[0], older);
    assert.deepEqual(saved.accounts[2], newer);
    assert.deepEqual(revoked, [savedRegistration.clientId]);
    await assert.rejects(auth.access(), { code: 'login_required' });
    await assert.rejects(auth.access(newer.clientId), { code: 'login_required' });
    const returning = await register(savedRegistration.clientId, savedRegistration.subject);
    assert.equal(returning.activeId, savedRegistration.clientId);
    assert.equal(returning.accounts.length, 1);
    assert.equal(authorizations[0].searchParams.get('client_id'), savedRegistration.clientId);
    assert.equal((await vault.read()).accounts.length, 3);
  });
});

test('unconfirmed logout clears local tokens and retains the registration for a later login', async () => {
  await withLegacyFixture(async ({ vault, auth, revoked }) => {
    const result = await auth.signOut();
    assert.equal(result.revocationPending, true);
    assert.equal(result.connected, false);
    assert.equal(result.activeId, null);
    assert.equal((await vault.read()).accounts[1].tokens, undefined);
    assert.equal((await vault.read()).preferredAccountId, savedRegistration.clientId);
    assert.deepEqual(revoked, [savedRegistration.clientId]);
  }, 400);
});

test('legacy installs without an active or remembered account reuse the last registration only on explicit login', async () => {
  await withLegacyFixture(async ({ vault, auth, register, newer, authorizations }) => {
    await vault.locked(data => { data.activeId = null; });
    const status = await auth.status();
    assert.equal(status.connected, false);
    assert.equal(status.activeId, null);
    assert.deepEqual(status.accounts, [{ id: newer.clientId, label: newer.label, connected: false }]);
    await assert.rejects(auth.access(newer.clientId), { code: 'login_required' });
    const result = await register(newer.clientId, newer.subject);
    assert.equal(result.activeId, newer.clientId);
    assert.equal(result.accounts.length, 1);
    assert.equal(authorizations[0].searchParams.get('client_id'), newer.clientId);
  });
});

test('an old account ID cannot switch, revoke or run requests through an inactive registration', async () => {
  await withLegacyFixture(async ({ vault, auth, revoked, older }) => {
    const before = await vault.read();
    let openedBrowser = false;
    await assert.rejects(auth.signIn(older.clientId, () => { openedBrowser = true; }), { code: 'account_unavailable' });
    await assert.rejects(auth.signOut(older.clientId), { code: 'account_unavailable' });
    await assert.rejects(auth.access(older.clientId), { code: 'login_required' });
    assert.equal(openedBrowser, false);
    assert.deepEqual(revoked, []);
    assert.deepEqual(await vault.read(), before);
  });
});
