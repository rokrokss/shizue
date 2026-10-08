import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ProviderError, requireOK, readJSON, visibleModels } from './responses.mjs';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
const hasDirectScope = (scope) => typeof scope === 'string' && scope.split(/\s+/).includes('chatgpt.tokens.use.direct');
// Keep legacy registrations intact, but expose and reuse only one connection.
// Remember the active registration across sign-out instead of falling back to an older entry.
const savedAccount = (data) => data.accounts.find((a) => a.clientId === data.activeId)
  || data.accounts.find((a) => a.clientId === data.preferredAccountId)
  || data.accounts.at(-1);
const safeEndpoint = (value) => {
  const url = new URL(value);
  if (url.origin !== AUTH) throw new Error('Untrusted OpenAI authentication endpoint.');
  return url;
};

export function callbackResult(url, pending) {
  if (url.searchParams.get('state') !== pending.state) throw new Error('Invalid OAuth state.');
  if (url.searchParams.has('error')) throw new ProviderError(url.searchParams.get('error'), 'ChatGPT sign-in was declined.');
  const clientId = url.searchParams.get('client_id') || pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client') throw new Error('ChatGPT did not issue an application client ID.');
  if (pending.clientId && clientId !== pending.clientId) throw new Error('ChatGPT returned a different application client ID.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('ChatGPT did not return an authorization code.');
  return { code, clientId };
}

export class ChatGPTAuth {
  constructor(vault, options = {}) {
    this.vault = vault;
    this.fetch = options.fetch || fetch;
    this.verify = options.verify || ((token, keys, options) => jwtVerify(token, keys, options));
  }
  async discovery() {
    if (!this.oidc) {
      const response = await this.fetch(`${AUTH}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(20_000) });
      const config = await readJSON(await requireOK(response));
      if (config.issuer !== AUTH) throw new Error('Unexpected OpenAI token issuer.');
      safeEndpoint(config.jwks_uri);
      this.oidc = config;
      this.keys = createRemoteJWKSet(new URL(config.jwks_uri));
    }
    return this.oidc;
  }
  async tokenRequest(parameters) {
    const response = await this.fetch(`${AUTH}/api/accounts/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...parameters, resource: RESOURCE }), signal: AbortSignal.timeout(25_000),
    });
    return readJSON(await requireOK(response));
  }
  async validatedTokens(tokens, clientId, nonce, subject) {
    if (!tokens.access_token || !hasDirectScope(tokens.scope)) throw new ProviderError('missing_plan_scope', 'ChatGPT plan access was not granted. Reconnect your account.');
    const config = await this.discovery();
    let identity;
    if (tokens.id_token) {
      const verified = await this.verify(tokens.id_token, this.keys, { issuer: config.issuer, audience: clientId, requiredClaims: ['sub', 'exp', ...(nonce ? ['nonce'] : [])] });
      identity = verified.payload;
      if (nonce && identity.nonce !== nonce) throw new Error('Invalid OpenAI ID token nonce.');
      if (subject && identity.sub !== subject) throw new Error('ChatGPT account changed during reconnect.');
    } else if (nonce) throw new Error('ChatGPT did not return an ID token.');
    if (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Invalid ChatGPT token expiry.');
    return { identity, tokens: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token, scope: tokens.scope, expiresAt: Date.now() + tokens.expires_in * 1000 } };
  }
  async signIn(accountId, emit, signal) {
    if (this.signingIn) throw new Error('A ChatGPT sign-in is already in progress.');
    this.signingIn = true;
    let server;
    let timer;
    let onAbort;
    try {
      const data = await this.vault.locked((data) => structuredClone(data));
      const account = savedAccount(data);
      if (accountId && accountId !== account?.clientId) throw new ProviderError('account_unavailable', 'The saved ChatGPT connection changed. Reopen settings to continue.');
      const pending = { state: random(), nonce: random(), verifier: random(), clientId: account?.clientId };
      let finish;
      let fail;
      const callback = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
      // Install a rejection handler before opening the listener/browser.
      callback.catch(() => {});
      server = createServer((req, res) => {
        const url = new URL(req.url || '/', pending.redirectUri);
        if (req.method !== 'GET' || url.pathname !== '/auth/callback' || req.headers.host !== new URL(pending.redirectUri).host) {
          res.writeHead(404).end(); return;
        }
        if (url.searchParams.get('state') !== pending.state) { res.writeHead(400).end('Invalid sign-in state.'); return; }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        try { finish(callbackResult(url, pending)); res.end('Return to Shizue to finish signing in. You can close this tab.'); }
        catch (error) { fail(error); res.writeHead(400).end('Sign-in failed. Return to Shizue.'); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      pending.redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
      timer = setTimeout(() => fail(new ProviderError('login_timeout', 'ChatGPT sign-in timed out. Try again.')), 180_000);
      onAbort = () => fail(new ProviderError('cancelled', 'ChatGPT sign-in cancelled.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      signal?.throwIfAborted();
      const url = new URL(`${AUTH}/api/accounts/authorize`);
      const parameters = {
        client_id: account?.clientId || 'dynamic_agent_client', response_type: 'code', resource: RESOURCE,
        scope: SCOPE, redirect_uri: pending.redirectUri, state: pending.state, nonce: pending.nonce,
        code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'), code_challenge_method: 'S256',
        ext_agent_host_id: data.hostId,
        ...(account ? {} : { agent_name_hint: 'Shizue' }),
        ...(account?.tokens?.idToken ? { id_token_hint: account.tokens.idToken } : {}),
      };
      url.search = new URLSearchParams(parameters).toString();
      emit({ authorizationUrl: url.href });
      const { code, clientId } = await callback;
      server.close();
      const tokens = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri });
      const validated = await this.validatedTokens(tokens, clientId, pending.nonce, account?.subject);
      if (!validated.tokens.refreshToken) throw new Error('ChatGPT did not grant offline access.');
      const duplicate = await this.vault.locked((current) => {
        const updated = { clientId, subject: validated.identity.sub, label: validated.identity.email || validated.identity.name || 'ChatGPT account', tokens: validated.tokens };
        const index = current.accounts.findIndex((a) => a.clientId === clientId);
        // Another helper may have completed the first sign-in while this one was
        // authorizing. Never add a second registration, even for a different user.
        if (index === -1 && current.accounts.length > 0) return true;
        if (index !== -1 && current.accounts[index].subject !== updated.subject) throw new Error('ChatGPT account changed during reconnect.');
        if (index === -1) current.accounts.push(updated); else current.accounts[index] = updated;
        current.activeId = clientId;
        current.preferredAccountId = clientId;
        return false;
      });
      if (duplicate) {
        const revoked = await this.revokeSession(clientId, validated.tokens.refreshToken);
        throw new ProviderError(revoked ? 'account_already_registered' : 'duplicate_account_revocation_pending',
          revoked ? 'A ChatGPT connection is already saved. Reopen settings to continue.' :
            'A ChatGPT connection is already saved. The new session was not saved, but remote revocation could not be confirmed. Review Shizue connections in ChatGPT settings.');
      }
      return this.status();
    } finally {
      clearTimeout(timer); server?.close(); server?.closeAllConnections();
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      this.signingIn = false;
    }
  }
  async access(accountId) {
    return this.vault.locked(async (data) => {
      if (accountId && accountId !== data.activeId) throw new ProviderError('login_required', 'Sign in to ChatGPT in Settings.');
      const account = data.accounts.find((a) => a.clientId === data.activeId);
      if (!account?.tokens) throw new ProviderError('login_required', 'Reconnect your ChatGPT account in Settings.');
      if (account.tokens.expiresAt < Date.now() + 60_000) {
        try {
          const result = await this.tokenRequest({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.tokens.refreshToken });
          const validated = await this.validatedTokens(result, account.clientId, undefined, account.subject);
          account.tokens = { ...validated.tokens, refreshToken: validated.tokens.refreshToken || account.tokens.refreshToken, idToken: validated.tokens.idToken || account.tokens.idToken };
        } catch (error) {
          // Keep the registration for a deliberate reconnect; do not retry an invalid grant.
          throw error;
        }
      }
      if (!hasDirectScope(account.tokens.scope)) throw new ProviderError('missing_plan_scope', 'Reconnect ChatGPT to grant plan access.');
      return { clientId: account.clientId, accessToken: account.tokens.accessToken };
    });
  }
  async catalog(accountId) {
    const session = await this.access(accountId);
    const response = await this.fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(25_000) });
    return visibleModels(await readJSON(await requireOK(response)));
  }
  async status() {
    const data = await this.vault.locked((data) => structuredClone(data));
    const active = data.accounts.find((a) => a.clientId === data.activeId);
    const saved = savedAccount(data);
    let models = [];
    let errorCode;
    if (active?.tokens) {
      try { models = await this.catalog(active.clientId); }
      catch (error) { errorCode = error.code || 'catalog_unavailable'; }
    }
    const accounts = saved ? [{ id: saved.clientId, label: saved.label, connected: Boolean(active?.tokens && !errorCode) }] : [];
    return { installed: true, activeId: active?.clientId ?? null, accounts, connected: Boolean(active?.tokens && !errorCode), models, ...(errorCode ? { errorCode } : {}) };
  }
  async revokeSession(clientId, refreshToken) {
    if (!refreshToken) return true;
    try {
      const config = await this.discovery();
      const endpoint = safeEndpoint(config.revocation_endpoint);
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await this.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (response?.ok) return true;
        if (response && response.status < 500) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    } catch { /* Report unconfirmed revocation without retaining the unwanted tokens. */ }
    return false;
  }
  async signOut(accountId) {
    let revoked = true;
    await this.vault.locked(async (data) => {
      const account = savedAccount(data);
      if (accountId && accountId !== account?.clientId) throw new ProviderError('account_unavailable', 'The saved ChatGPT connection changed. Reopen settings to continue.');
      if (!account) return;
      data.preferredAccountId = account.clientId;
      revoked = await this.revokeSession(account.clientId, account.tokens?.refreshToken);
      delete account.tokens;
      if (data.activeId === account.clientId) data.activeId = null;
    });
    return { ...await this.status(), revocationPending: !revoked };
  }
}
