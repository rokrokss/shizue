import {
  STORAGE_ANTHROPIC_KEY, STORAGE_ANTHROPIC_VALIDATED,
  STORAGE_CHAT_MODEL, STORAGE_TRANSLATE_MODEL, STORAGE_CONNECTION_MODE,
  STORAGE_GEMINI_KEY, STORAGE_GEMINI_VALIDATED, STORAGE_LOCAL_SERVER,
  STORAGE_OPENAI_KEY, STORAGE_OPENAI_VALIDATED,
  STORAGE_OPENROUTER_KEY, STORAGE_OPENROUTER_VALIDATED,
  STORAGE_PROVIDER_MODEL_PREFERENCES,
} from '@/config/constants';
import { registeredAIProviders, resolveChatGPTSignOut } from '@/lib/modelPreferences';

export async function chatGPTSignOutUpdates() {
  const stored = await chrome.storage.local.get([
    STORAGE_CHAT_MODEL, STORAGE_TRANSLATE_MODEL, STORAGE_PROVIDER_MODEL_PREFERENCES,
    STORAGE_OPENAI_KEY, STORAGE_OPENAI_VALIDATED,
    STORAGE_OPENROUTER_KEY, STORAGE_OPENROUTER_VALIDATED,
    STORAGE_GEMINI_KEY, STORAGE_GEMINI_VALIDATED,
    STORAGE_ANTHROPIC_KEY, STORAGE_ANTHROPIC_VALIDATED, STORAGE_LOCAL_SERVER,
  ]);
  const localModels = stored[STORAGE_LOCAL_SERVER]?.models ?? [];
  const registered = registeredAIProviders({
    'openai-api-key': stored[STORAGE_OPENAI_KEY],
    'openrouter-api-key': stored[STORAGE_OPENROUTER_KEY],
    'gemini-api-key': stored[STORAGE_GEMINI_KEY],
    'anthropic-api-key': stored[STORAGE_ANTHROPIC_KEY],
  }, {
    'openai-api-key': stored[STORAGE_OPENAI_VALIDATED],
    'openrouter-api-key': stored[STORAGE_OPENROUTER_VALIDATED],
    'gemini-api-key': stored[STORAGE_GEMINI_VALIDATED],
    'anthropic-api-key': stored[STORAGE_ANTHROPIC_VALIDATED],
  }, localModels);
  const result = resolveChatGPTSignOut(
    stored[STORAGE_PROVIDER_MODEL_PREFERENCES] ?? { selections: {} },
    { chat: stored[STORAGE_CHAT_MODEL], translation: stored[STORAGE_TRANSLATE_MODEL] },
    registered, { chatGPT: [], local: localModels },
  );
  const updates: Record<string, unknown> = { [STORAGE_PROVIDER_MODEL_PREFERENCES]: result.preferences };
  if (result.selection.chat) updates[STORAGE_CHAT_MODEL] = result.selection.chat;
  if (result.selection.translation) updates[STORAGE_TRANSLATE_MODEL] = result.selection.translation;
  if (result.provider && result.provider !== 'local') {
    updates[STORAGE_CONNECTION_MODE] = result.provider === 'openrouter-api-key' ? 'openrouter' : 'direct';
  }
  return { updates, requiresOnboarding: !result.provider };
}
