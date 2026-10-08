import { STORAGE_CHATGPT_CONNECTION, STORAGE_CHATGPT_CREDENTIALS } from '@/config/constants';
import { ChatGPTConnection, ChatGPTSettingsResult } from '@/lib/chatgpt';
import { ChatGPTAuth, StorageVault, type Loopback } from '@/lib/chatgptAuth';
import { ProviderError, requireOK, responseEvents, responseRequestBody, type ResponseRequest } from '@/lib/chatgptResponses';
import { chatGPTSignOutUpdates } from './chatgptSignOut';

export class ChatGPTError extends Error {
  constructor(public code: string, detail: string) {
    const messages: Record<string, string> = {
      subscription_sharing_usage_limit_exceeded: 'ChatGPT plan usage limit reached. Manage usage: https://chatgpt.com/settings/usage',
      subscription_sharing_usage_unavailable: 'ChatGPT plan usage is unavailable. Manage usage: https://chatgpt.com/settings/usage',
      invalid_grant: 'Your ChatGPT session expired. Reconnect in AI provider settings.',
      login_required: 'Reconnect your ChatGPT account in AI provider settings.',
    };
    super(messages[code] || detail);
  }
}
const toChatGPTError = (error: unknown) => error instanceof ProviderError ? new ChatGPTError(error.code, error.message) : error;

// OpenAI's flow returns to http://127.0.0.1:<port>/auth/callback. Nothing listens there: a session
// rule redirects that navigation to the extension's callback page before Chrome connects, and the
// page passes the query string to handleChatGPTCallback. Only the port varies between sign-ins.
const CALLBACK_RULE_ID = 2;
let callbackReceiver: { redirectUri: string; receive: (url: URL) => boolean } | undefined;

const browserLoopback: Loopback = {
  async open(receive) {
    const port = 49152 + (crypto.getRandomValues(new Uint16Array(1))[0] % 16384);
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [CALLBACK_RULE_ID],
      addRules: [{
        id: CALLBACK_RULE_ID,
        priority: 1,
        condition: { urlFilter: `|${redirectUri}`, resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME] },
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { transform: { scheme: 'chrome-extension', host: chrome.runtime.id, port: '', path: '/chatgpt-callback.html' } },
        },
      }],
    });
    const receiver = { redirectUri, receive };
    callbackReceiver = receiver;
    // Chrome may stop a worker after 30 s without events, and the user may take minutes to sign
    // in. Extension API calls reset that timer.
    const keepAlive = setInterval(() => { void chrome.runtime.getPlatformInfo(); }, 20_000);
    let closed = false;
    return {
      redirectUri,
      close: async () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        if (callbackReceiver === receiver) callbackReceiver = undefined;
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [CALLBACK_RULE_ID] });
      },
    };
  },
};

// Returns whether the callback belonged to the sign-in in progress.
export function handleChatGPTCallback(search: unknown): boolean {
  if (!callbackReceiver || typeof search !== 'string' || !search.startsWith('?')) return false;
  return callbackReceiver.receive(new URL(`${callbackReceiver.redirectUri}${search}`));
}

let auth: ChatGPTAuth | undefined;
const chatGPTAuth = () =>
  auth ??= new ChatGPTAuth(new StorageVault(chrome.storage.local, STORAGE_CHATGPT_CREDENTIALS), { loopback: browserLoopback });

export interface ChatGPTAccounts {
  status(): Promise<ChatGPTConnection>;
  signIn(accountId: string | undefined, emit: (event: { authorizationUrl: string }) => void): Promise<ChatGPTConnection>;
  signOut(accountId?: string): Promise<ChatGPTConnection>;
}

export function chatGPTSettingsHandler(accounts: () => ChatGPTAccounts) {
  let settingsGeneration = 0;
  let statusGeneration = 0;
  let activeAccountOperations = 0;
  const openAuthorization = ({ authorizationUrl }: { authorizationUrl: string }) => {
    const url = new URL(authorizationUrl);
    if (url.origin === 'https://auth.openai.com' && url.pathname === '/api/accounts/authorize') void chrome.tabs.create({ url: url.href });
  };
  return async function handleChatGPTSettings(operation: string, accountId?: string): Promise<ChatGPTSettingsResult> {
    if (!['status', 'signIn', 'signOut'].includes(operation)) throw new Error('Unknown ChatGPT settings operation.');
    if (accountId !== undefined && (typeof accountId !== 'string' || accountId.length > 200)) throw new Error('Invalid ChatGPT account.');
    const updatingAccount = operation !== 'status';
    const generation = updatingAccount ? ++settingsGeneration : settingsGeneration;
    const statusVersion = updatingAccount ? undefined : ++statusGeneration;
    const canPublishStatus = activeAccountOperations === 0;
    if (updatingAccount) activeAccountOperations++;
    try {
      const connection = operation === 'status' ? await accounts().status()
        : operation === 'signIn' ? await accounts().signIn(accountId, openAuthorization)
          : await accounts().signOut(accountId);
      // Status checks before or during an account operation cannot replace its result.
      const publish = generation === settingsGeneration && (updatingAccount || (
        canPublishStatus && activeAccountOperations === 0 && statusVersion === statusGeneration
      ));
      if (publish && operation === 'signOut' && !connection.activeId) {
        const fallback = await chatGPTSignOutUpdates();
        // The storage read may overlap a newer login. Only the latest account operation may publish.
        if (generation !== settingsGeneration) return connection;
        await chrome.storage.local.set({ ...fallback.updates, [STORAGE_CHATGPT_CONNECTION]: connection });
        return { ...connection, requiresOnboarding: fallback.requiresOnboarding };
      }
      if (publish) await chrome.storage.local.set({ [STORAGE_CHATGPT_CONNECTION]: connection });
      return connection;
    } catch (error) {
      throw toChatGPTError(error);
    } finally { if (updatingAccount) activeAccountOperations--; }
  };
}

export const handleChatGPTSettings = chatGPTSettingsHandler(chatGPTAuth);

export async function* chatGPTResponseStream(payload: ResponseRequest, signal?: AbortSignal) {
  try {
    const body = responseRequestBody(payload);
    const accounts = chatGPTAuth();
    const session = await accounts.access();
    const models = await accounts.catalog(session.clientId);
    if (!models.some((m) => m.id === body.model)) throw new ProviderError('model_unavailable', 'This model is unavailable for the selected ChatGPT account.');
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(600_000);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    yield* responseEvents((await requireOK(response)).body);
  } catch (error) {
    throw toChatGPTError(error);
  }
}
