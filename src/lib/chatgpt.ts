export const CHATGPT_SETTINGS_MESSAGE = 'chatgpt_settings';
export const CHATGPT_CALLBACK_MESSAGE = 'chatgpt_callback';
export const CHATGPT_REQUEST_TIMEOUTS = {
  status: 10_000,
  signIn: 240_000,
  signOut: 120_000,
};

export interface ChatGPTConnection {
  connected: boolean;
  activeId: string | null;
  accounts: { id: string; label: string; connected: boolean }[];
  models: { id: string; label: string }[];
  errorCode?: string;
  revocationPending?: boolean;
}

export const disconnectedChatGPT: ChatGPTConnection = {
  connected: false, activeId: null, accounts: [], models: [],
};

export interface ChatGPTSettingsResult extends ChatGPTConnection {
  // Computed by the extension after explicit logout; not persisted as account state.
  requiresOnboarding?: boolean;
}

export const chatGPTNeedsSignIn = (connection: ChatGPTConnection): boolean =>
  Boolean(connection.activeId && !connection.connected && connection.errorCode && [
    'invalid_grant', 'invalid_token', 'login_required', 'missing_plan_scope', 'http_401',
  ].includes(connection.errorCode));

export type ChatGPTSettingsOperation = 'status' | 'signIn' | 'signOut';
export class ChatGPTSettingsError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function chatGPTSettings(operation: ChatGPTSettingsOperation, accountId?: string): Promise<ChatGPTSettingsResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ action: CHATGPT_SETTINGS_MESSAGE, operation, accountId }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ChatGPTSettingsError('request_timeout', 'ChatGPT request timed out. Try again.')), CHATGPT_REQUEST_TIMEOUTS[operation] + 5_000);
      }),
    ]);
    if (!response?.success) throw new ChatGPTSettingsError(response?.errorCode || 'connection_failed', response?.error || 'ChatGPT connection failed.');
    return response.connection;
  } finally { clearTimeout(timer); }
}
