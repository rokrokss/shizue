import { STORAGE_CHATGPT_CONNECTION } from '@/config/constants';
import { CHATGPT_HOST, CHATGPT_REQUEST_TIMEOUTS, ChatGPTConnection, ChatGPTSettingsResult, disconnectedChatGPT } from '@/lib/chatgpt';
import { chatGPTSignOutUpdates } from './chatgptSignOut';

interface NativeEvent {
  authorizationUrl?: string;
  delta?: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}
interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  event?: (event: NativeEvent) => void;
}
let port: chrome.runtime.Port | undefined;
const pending = new Map<string, Pending>();

function nativePort() {
  if (port) return port;
  const current = chrome.runtime.connectNative(CHATGPT_HOST);
  port = current;
  current.onMessage.addListener((message) => {
    const request = pending.get(message.id);
    if (!request) return;
    if (message.event) { request.event?.(message.event); return; }
    pending.delete(message.id);
    if (message.error) request.reject(new ChatGPTError(message.error.code, message.error.message));
    else request.resolve(message.result);
  });
  current.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message;
    if (port === current) port = undefined;
    for (const request of pending.values()) request.reject(new ChatGPTError('helper_unavailable', detail || 'ChatGPT helper disconnected.'));
    pending.clear();
    void chrome.storage.local.set({ [STORAGE_CHATGPT_CONNECTION]: disconnectedChatGPT });
  });
  return current;
}

export class ChatGPTError extends Error {
  constructor(public code: string, detail: string) {
    const messages: Record<string, string> = {
      helper_unavailable: 'Install the Shizue ChatGPT helper in AI provider settings, then reconnect.',
      subscription_sharing_usage_limit_exceeded: 'ChatGPT plan usage limit reached. Manage usage: https://chatgpt.com/settings/usage',
      subscription_sharing_usage_unavailable: 'ChatGPT plan usage is unavailable. Manage usage: https://chatgpt.com/settings/usage',
      invalid_grant: 'Your ChatGPT session expired. Reconnect in AI provider settings.',
      login_required: 'Reconnect your ChatGPT account in AI provider settings.',
    };
    super(messages[code] || detail);
  }
}

export function nativeRequest<T>(operation: string, payload: Record<string, unknown> = {}, event?: Pending['event'], signal?: AbortSignal): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    let current: chrome.runtime.Port;
    const cancel = () => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      try { current.postMessage({ id, operation: 'cancel' }); } catch { /* Disconnected. */ }
      request.reject(new DOMException('Request cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      pending.get(id)?.reject(new ChatGPTError('request_timeout', 'ChatGPT request timed out. Try again.'));
      pending.delete(id);
      try { current.postMessage({ id, operation: 'cancel' }); } catch { /* Disconnected. */ }
    }, CHATGPT_REQUEST_TIMEOUTS[operation as keyof typeof CHATGPT_REQUEST_TIMEOUTS] || 120_000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    try {
      signal?.throwIfAborted();
      current = nativePort();
      pending.set(id, { resolve: (value) => { cleanup(); resolve(value); }, reject: (error) => { cleanup(); reject(error); }, event });
      signal?.addEventListener('abort', cancel, { once: true });
      current.postMessage({ id, operation, ...payload });
    } catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}

let settingsGeneration = 0;
let statusGeneration = 0;
let activeAccountOperations = 0;
export async function handleChatGPTSettings(operation: string, accountId?: string): Promise<ChatGPTSettingsResult> {
  if (!['status', 'signIn', 'signOut'].includes(operation)) throw new Error('Unknown ChatGPT settings operation.');
  if (accountId !== undefined && (typeof accountId !== 'string' || accountId.length > 200)) throw new Error('Invalid ChatGPT account.');
  const updatingAccount = operation !== 'status';
  const generation = updatingAccount ? ++settingsGeneration : settingsGeneration;
  const statusVersion = updatingAccount ? undefined : ++statusGeneration;
  const canPublishStatus = activeAccountOperations === 0;
  if (updatingAccount) activeAccountOperations++;
  try {
    const connection = await nativeRequest<ChatGPTConnection>(operation, { accountId }, (event) => {
      if (!event.authorizationUrl) return;
      const url = new URL(event.authorizationUrl);
      if (url.origin === 'https://auth.openai.com' && url.pathname === '/api/accounts/authorize') void chrome.tabs.create({ url: url.href });
    });
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
    if (operation === 'status' && error instanceof ChatGPTError && error.code === 'helper_unavailable') return disconnectedChatGPT;
    throw error;
  } finally { if (updatingAccount) activeAccountOperations--; }
}

// A queue bridges Chrome's callback port to the existing async model stream.
export async function* nativeResponseStream(payload: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<NativeEvent> {
  const queue: NativeEvent[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  let failure: unknown;
  const controller = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const completion = nativeRequest('responses', payload, (event) => { queue.push(event); wake?.(); }, combinedSignal)
    .catch((error) => { failure = error; })
    .finally(() => { done = true; wake?.(); });
  try {
    while (!done || queue.length) {
      if (queue.length) { yield queue.shift()!; continue; }
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = undefined;
    }
    if (failure) throw failure;
  } finally { controller.abort(); await completion; }
}
