// Sign in with ChatGPT (OpenAI's open-source flow) for the background service worker.
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
// Pure apart from the injected vault, fetch and loopback, so tests can drive it with fixtures.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions, type JWTPayload } from 'jose';
import { ProviderError, requireOK, readJSON, visibleModels } from './chatgptResponses';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (value: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const hasDirectScope = (scope: unknown) => typeof scope === 'string' && scope.split(/\s+/).includes('chatgpt.tokens.use.direct');

export interface ChatGPTTokens { accessToken: string; refreshToken?: string; idToken?: string; scope: string; expiresAt: number }
export interface ChatGPTAccount { clientId: string; subject: string; label: string; tokens?: ChatGPTTokens }
export interface VaultData { hostId: string; accounts: ChatGPTAccount[]; activeId: string | null; preferredAccountId?: string }

// Keep legacy registrations intact, but expose and reuse only one connection.
// Remember the active registration across sign-out instead of falling back to an older entry.
const savedAccount = (data: VaultData) => data.accounts.find((a) => a.clientId === data.activeId)
  || data.accounts.find((a) => a.clientId === data.preferredAccountId)
  || data.accounts.at(-1);
const safeEndpoint = (value: string) => {
  const url = new URL(value);
  if (url.origin !== AUTH) throw new Error('Untrusted OpenAI authentication endpoint.');
  return url;
};

interface StorageArea {
  get(key: string): Promise<Record<string, any>>;
  set(items: Record<string, unknown>): Promise<void>;
}

// Credentials live in extension storage under one key, like the API keys. Only the background
// service worker reads them, so an in-memory queue serializes every read-modify-write, including
// rotating refresh tokens.
export class StorageVault {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly area: StorageArea, private readonly key: string) {}
  private async stored(): Promise<VaultData | undefined> {
    const { [this.key]: value } = await this.area.get(this.key);
    return value && typeof value === 'object' && Array.isArray(value.accounts) ? structuredClone(value) : undefined;
  }
  async read(): Promise<VaultData> {
    return await this.stored() ?? { hostId: `urn:uuid:${crypto.randomUUID()}`, accounts: [], activeId: null };
  }
  locked<T>(fn: (data: VaultData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const stored = await this.stored();
      const data = stored ? structuredClone(stored) : await this.read();
      const result = await fn(data);
      // Write only changes, but always the first record: the host ID must stay stable.
      if (!stored || JSON.stringify(data) !== JSON.stringify(stored)) await this.area.set({ [this.key]: data });
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

// Catches the browser's navigation to http://127.0.0.1:<port>/auth/callback for one sign-in.
// receive() gets each caught callback URL and returns whether it was accepted.
export interface Loopback {
  open(receive: (url: URL) => boolean): Promise<{ redirectUri: string; close: () => Promise<void> }>;
}

export function callbackResult(url: URL, pending: { state: string; clientId?: string }) {
  if (url.searchParams.get('state') !== pending.state) throw new Error('Invalid OAuth state.');
  if (url.searchParams.has('error')) throw new ProviderError(url.searchParams.get('error')!, 'ChatGPT sign-in was declined.');
  const clientId = url.searchParams.get('client_id') || pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client') throw new Error('ChatGPT did not issue an application client ID.');
  if (pending.clientId && clientId !== pending.clientId) throw new Error('ChatGPT returned a different application client ID.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('ChatGPT did not return an authorization code.');
  return { code, clientId };
}

type Verify = (token: string, keys: ReturnType<typeof createRemoteJWKSet>, options: JWTVerifyOptions) => Promise<{ payload: JWTPayload }>;

export class ChatGPTAuth {
  private readonly fetch: typeof fetch;
  private readonly verify: Verify;
  private readonly loopback?: Loopback;
  private signingIn = false;
  oidc?: { issuer: string; jwks_uri?: string; revocation_endpoint?: string };
  keys?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly vault: StorageVault, options: { fetch?: typeof fetch; verify?: Verify; loopback?: Loopback } = {}) {
    // Browsers reject fetch called with another `this`.
    this.fetch = options.fetch || ((input, init) => fetch(input, init));
    this.verify = options.verify || ((token, keys, verifyOptions) => jwtVerify(token, keys, verifyOptions));
    this.loopback = options.loopback;
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
    return this.oidc!;
  }
  async tokenRequest(parameters: Record<string, string>) {
    const response = await this.fetch(`${AUTH}/api/accounts/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...parameters, resource: RESOURCE }), signal: AbortSignal.timeout(25_000),
    });
    return readJSON(await requireOK(response));
  }
  async validatedTokens(tokens: any, clientId: string, nonce?: string, subject?: string) {
    if (!tokens.access_token || !hasDirectScope(tokens.scope)) throw new ProviderError('missing_plan_scope', 'ChatGPT plan access was not granted. Reconnect your account.');
    const config = await this.discovery();
    let identity: JWTPayload | undefined;
    if (tokens.id_token) {
      const verified = await this.verify(tokens.id_token, this.keys!, { issuer: config.issuer, audience: clientId, requiredClaims: ['sub', 'exp', ...(nonce ? ['nonce'] : [])] });
      identity = verified.payload;
      if (nonce && identity.nonce !== nonce) throw new Error('Invalid OpenAI ID token nonce.');
      if (subject && identity.sub !== subject) throw new Error('ChatGPT account changed during reconnect.');
    } else if (nonce) throw new Error('ChatGPT did not return an ID token.');
    if (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Invalid ChatGPT token expiry.');
    return { identity, tokens: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token, scope: tokens.scope, expiresAt: Date.now() + tokens.expires_in * 1000 } as ChatGPTTokens };
  }
  async signIn(accountId: string | undefined, emit: (event: { authorizationUrl: string }) => void, signal?: AbortSignal) {
    if (this.signingIn) throw new Error('A ChatGPT sign-in is already in progress.');
    this.signingIn = true;
    let listener: Awaited<ReturnType<Loopback['open']>> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const data = await this.vault.locked((data) => structuredClone(data));
      const account = savedAccount(data);
      if (accountId && accountId !== account?.clientId) throw new ProviderError('account_unavailable', 'The saved ChatGPT connection changed. Reopen settings to continue.');
      if (!this.loopback) throw new Error('ChatGPT sign-in is unavailable.');
      const pending = { state: random(), nonce: random(), verifier: random(), clientId: account?.clientId, redirectUri: '' };
      let finish!: (value: { code: string; clientId: string }) => void;
      let fail!: (error: unknown) => void;
      const callback = new Promise<{ code: string; clientId: string }>((resolve, reject) => { finish = resolve; fail = reject; });
      // Install a rejection handler before catching callbacks or opening the browser.
      callback.catch(() => {});
      listener = await this.loopback.open((url) => {
        if (url.pathname !== '/auth/callback' || url.searchParams.get('state') !== pending.state) return false;
        try { finish(callbackResult(url, pending)); return true; }
        catch (error) { fail(error); return false; }
      });
      pending.redirectUri = listener.redirectUri;
      timer = setTimeout(() => fail(new ProviderError('login_timeout', 'ChatGPT sign-in timed out. Try again.')), 180_000);
      onAbort = () => fail(new ProviderError('cancelled', 'ChatGPT sign-in cancelled.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      signal?.throwIfAborted();
      const url = new URL(`${AUTH}/api/accounts/authorize`);
      const parameters: Record<string, string> = {
        client_id: account?.clientId || 'dynamic_agent_client', response_type: 'code', resource: RESOURCE,
        scope: SCOPE, redirect_uri: pending.redirectUri, state: pending.state, nonce: pending.nonce,
        code_challenge: await sha256(pending.verifier), code_challenge_method: 'S256',
        ext_agent_host_id: data.hostId,
        ...(account ? {} : { agent_name_hint: 'Shizue' }),
        ...(account?.tokens?.idToken ? { id_token_hint: account.tokens.idToken } : {}),
      };
      url.search = new URLSearchParams(parameters).toString();
      emit({ authorizationUrl: url.href });
      const { code, clientId } = await callback;
      await listener.close();
      const tokens = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri });
      const validated = await this.validatedTokens(tokens, clientId, pending.nonce, account?.subject);
      if (!validated.tokens.refreshToken) throw new Error('ChatGPT did not grant offline access.');
      const duplicate = await this.vault.locked((current) => {
        const updated = { clientId, subject: validated.identity!.sub!, label: (validated.identity!.email || validated.identity!.name || 'ChatGPT account') as string, tokens: validated.tokens };
        const index = current.accounts.findIndex((a) => a.clientId === clientId);
        // Another sign-in may have completed while this one was authorizing. Never add a
        // second registration, even for a different user.
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
      clearTimeout(timer);
      await listener?.close();
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      this.signingIn = false;
    }
  }
  async access(accountId?: string) {
    return this.vault.locked(async (data) => {
      if (accountId && accountId !== data.activeId) throw new ProviderError('login_required', 'Sign in to ChatGPT in Settings.');
      const account = data.accounts.find((a) => a.clientId === data.activeId);
      if (!account?.tokens) throw new ProviderError('login_required', 'Reconnect your ChatGPT account in Settings.');
      if (account.tokens.expiresAt < Date.now() + 60_000) {
        // Keep the registration for a deliberate reconnect; do not retry an invalid grant.
        const result = await this.tokenRequest({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.tokens.refreshToken! });
        const validated = await this.validatedTokens(result, account.clientId, undefined, account.subject);
        account.tokens = { ...validated.tokens, refreshToken: validated.tokens.refreshToken || account.tokens.refreshToken, idToken: validated.tokens.idToken || account.tokens.idToken };
      }
      if (!hasDirectScope(account.tokens.scope)) throw new ProviderError('missing_plan_scope', 'Reconnect ChatGPT to grant plan access.');
      return { clientId: account.clientId, accessToken: account.tokens.accessToken };
    });
  }
  async catalog(accountId?: string) {
    const session = await this.access(accountId);
    const response = await this.fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(25_000) });
    return visibleModels(await readJSON(await requireOK(response)));
  }
  async status() {
    const data = await this.vault.locked((data) => structuredClone(data));
    const active = data.accounts.find((a) => a.clientId === data.activeId);
    const saved = savedAccount(data);
    let models: { id: string; label: string }[] = [];
    let errorCode: string | undefined;
    if (active?.tokens) {
      try { models = await this.catalog(active.clientId); }
      catch (error) { errorCode = (error as ProviderError).code || 'catalog_unavailable'; }
    }
    const accounts = saved ? [{ id: saved.clientId, label: saved.label, connected: Boolean(active?.tokens && !errorCode) }] : [];
    return { activeId: active?.clientId ?? null, accounts, connected: Boolean(active?.tokens && !errorCode), models, ...(errorCode ? { errorCode } : {}) };
  }
  async revokeSession(clientId: string, refreshToken?: string) {
    if (!refreshToken) return true;
    try {
      const config = await this.discovery();
      const endpoint = safeEndpoint(config.revocation_endpoint!);
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await this.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (response?.ok) return true;
        if (response && response.status < 500) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    } catch { /* Report unconfirmed revocation without retaining the unwanted tokens. */ }
    return false;
  }
  async signOut(accountId?: string) {
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
