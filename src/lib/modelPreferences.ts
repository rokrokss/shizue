import {
  ApiKeyProvider,
  ChatModel,
  TranslateModel,
  chatGPTModelId,
  chatGPTModelRef,
  isChatGPTModel,
  isChatModel,
  isLocalModel,
  isSelectableChatGPTModelId,
  localModelId,
  localModelRef,
  MODELS,
} from '@/lib/modelRegistry';

export const defaultOpenAIChatModel: ChatModel = 'gpt';
export const defaultOpenAITranslateModel: TranslateModel = 'gpt-mini';
export const defaultGeminiChatModel: ChatModel = 'gemini-flash';
export const defaultGeminiTranslateModel: TranslateModel = 'gemini-flash-lite';
export const defaultAnthropicChatModel: ChatModel = 'claude-sonnet';
export const defaultAnthropicTranslateModel: TranslateModel = 'claude-haiku';
export const defaultOpenRouterChatModel: ChatModel = 'gpt';
export const defaultOpenRouterTranslateModel: TranslateModel = 'gpt-mini';

export type AIProvider = ApiKeyProvider | 'local' | 'chatgpt';
export interface ProviderModelSelection {
  chat?: ChatModel;
  translation?: TranslateModel;
}
export interface ProviderModelPreferences {
  provider?: AIProvider;
  selections: Partial<Record<AIProvider, ProviderModelSelection>>;
  recentProviders?: AIProvider[];
}
export interface ProviderModelCatalogs {
  chatGPT: readonly { id: string }[];
  local: readonly { id: string }[];
}

export const isProviderModel = (provider: AIProvider, model: unknown): model is ChatModel =>
  isChatModel(model) && isChatGPTModel(model) === (provider === 'chatgpt') &&
  (!isChatGPTModel(model) || isSelectableChatGPTModelId(chatGPTModelId(model)));

export function rememberProviderModels(
  preferences: ProviderModelPreferences,
  provider: AIProvider,
  selection: ProviderModelSelection,
): ProviderModelPreferences {
  const previous = preferences.selections[provider];
  const chat = isProviderModel(provider, selection.chat) ? selection.chat : previous?.chat;
  const translation = isProviderModel(provider, selection.translation) ? selection.translation : previous?.translation;
  const unchanged = chat === previous?.chat && translation === previous?.translation;
  const recentProviders = preferences.recentProviders ?? [
    ...(preferences.provider ? [preferences.provider] : []),
    ...Object.keys(preferences.selections).reverse() as AIProvider[],
  ];
  if (preferences.provider === provider && unchanged && preferences.recentProviders?.[0] === provider) return preferences;
  return {
    provider,
    recentProviders: [provider, ...recentProviders.filter((item, index) => item !== provider && recentProviders.indexOf(item) === index)],
    selections: unchanged ? preferences.selections : {
      ...preferences.selections,
      [provider]: { chat, translation },
    },
  };
}

export type RegisteredAIProvider = Exclude<AIProvider, 'chatgpt'>;
const apiProviders: ApiKeyProvider[] = ['openrouter-api-key', 'openai-api-key', 'gemini-api-key', 'anthropic-api-key'];

export function registeredAIProviders(
  keys: Partial<Record<ApiKeyProvider, string>>,
  validated: Partial<Record<ApiKeyProvider, boolean>>,
  localModels: readonly { id: string }[],
): RegisteredAIProvider[] {
  return [
    ...apiProviders.filter((provider) => Boolean(keys[provider]?.trim()) && validated[provider] !== false),
    ...(localModels.length ? ['local' as const] : []),
  ];
}

export function resolveChatGPTSignOut(
  preferences: ProviderModelPreferences,
  current: ProviderModelSelection,
  registered: RegisteredAIProvider[],
  catalogs: ProviderModelCatalogs,
): { preferences: ProviderModelPreferences; provider: RegisteredAIProvider | null; selection: ProviderModelSelection } {
  // Save the departing ChatGPT choices before replacing the shared model slots.
  const remembered = rememberProviderModels(preferences, 'chatgpt', current);
  const recent = preferences.recentProviders ?? [
    ...(preferences.provider ? [preferences.provider] : []),
    ...Object.keys(preferences.selections).reverse() as AIProvider[],
  ];
  const provider = [...recent, ...registered].find((item): item is RegisteredAIProvider =>
    item !== 'chatgpt' && registered.includes(item));
  if (!provider) return { preferences: remembered, provider: null, selection: {} };

  const available = (model: unknown): model is ChatModel => {
    if (!isChatModel(model) || isChatGPTModel(model)) return false;
    if (isLocalModel(model)) return registered.includes('local') && catalogs.local.some(({ id }) => id === localModelId(model));
    const direct = MODELS[model].provider;
    return registered.includes('openrouter-api-key') || Boolean(direct && registered.includes(direct));
  };
  const saved = preferences.selections[provider];
  const defaults = defaultProviderModels(provider, catalogs);
  const selection = {
    chat: available(saved?.chat) ? saved.chat : defaults.chat,
    translation: available(saved?.translation) ? saved.translation : defaults.translation,
  };
  return { provider, selection, preferences: rememberProviderModels(remembered, provider, selection) };
}

function defaultProviderModels(provider: AIProvider, catalogs: ProviderModelCatalogs): ProviderModelSelection {
  switch (provider) {
    case 'openrouter-api-key': return { chat: defaultOpenRouterChatModel, translation: defaultOpenRouterTranslateModel };
    case 'openai-api-key': return { chat: defaultOpenAIChatModel, translation: defaultOpenAITranslateModel };
    case 'gemini-api-key': return { chat: defaultGeminiChatModel, translation: defaultGeminiTranslateModel };
    case 'anthropic-api-key': return { chat: defaultAnthropicChatModel, translation: defaultAnthropicTranslateModel };
    case 'chatgpt': {
      const models = catalogs.chatGPT.filter(({ id }) => isSelectableChatGPTModelId(id));
      const first = models[0];
      if (!first) return {};
      const fast = models.find(({ id }) => /luna|mini/i.test(id)) ?? first;
      return { chat: chatGPTModelRef(first.id), translation: chatGPTModelRef(fast.id) };
    }
    case 'local': {
      const first = catalogs.local[0];
      return first ? { chat: localModelRef(first.id), translation: localModelRef(first.id) } : {};
    }
  }
}

export function resolveProviderModels(
  provider: AIProvider,
  current: ProviderModelSelection,
  saved: ProviderModelSelection | undefined,
  catalogs: ProviderModelCatalogs,
): ProviderModelSelection {
  const usable = (model: unknown): model is ChatModel => {
    if (!isProviderModel(provider, model)) return false;
    // Keep a remembered selection while its connection/catalog is temporarily unavailable.
    if (isChatGPTModel(model)) return !catalogs.chatGPT.length || catalogs.chatGPT.some(({ id }) => id === chatGPTModelId(model));
    if (isLocalModel(model)) return !catalogs.local.length || catalogs.local.some(({ id }) => id === localModelId(model));
    return true;
  };
  const defaults = defaultProviderModels(provider, catalogs);
  const pick = (key: keyof ProviderModelSelection) =>
    usable(current[key]) ? current[key] : usable(saved?.[key]) ? saved?.[key] : defaults[key];
  return { chat: pick('chat'), translation: pick('translation') };
}
