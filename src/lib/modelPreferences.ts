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
  getModelSpec,
} from '@/lib/modelRegistry';
import { getModelList, type ModelList } from '@/lib/modelList';

// The provider's default chat and translation slots in the current model list.
export const defaultModelsFor = (provider: ApiKeyProvider) => getModelList().defaults[provider];

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
    const direct = getModelSpec(model)?.provider;
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
    case 'openrouter-api-key':
    case 'openai-api-key':
    case 'gemini-api-key':
    case 'anthropic-api-key': return { ...defaultModelsFor(provider) };
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

export interface SavedModelSelections {
  chat?: unknown;
  translation?: unknown;
  preferences?: ProviderModelPreferences;
}

// Moves saved choices off slots `list` no longer has: to the slot its successors name, else to the
// provider's default. ChatGPT choices follow the list's ChatGPT successors; local ones stay.
// Returns only what changed.
export function migrateModelSelections(list: ModelList, saved: SavedModelSelections): SavedModelSelections {
  const isApiKeyProvider = (provider?: AIProvider): provider is ApiKeyProvider =>
    provider !== undefined && Object.hasOwn(list.defaults, provider);
  const migrate = (model: unknown, provider: AIProvider | undefined, use: keyof ProviderModelSelection) => {
    if (typeof model !== 'string' || isLocalModel(model)) return model;
    if (isChatGPTModel(model)) {
      const id = chatGPTModelId(model);
      return Object.hasOwn(list.chatgpt.successors, id) ? chatGPTModelRef(list.chatgpt.successors[id]) : model;
    }
    if (list.models.some(({ slot }) => slot === model)) return model;
    if (Object.hasOwn(list.successors, model)) return list.successors[model];
    // Preferences saved before providers were remembered don't say which key the slot ran on.
    return list.defaults[isApiKeyProvider(provider) ? provider : 'openai-api-key'][use];
  };

  const changes: SavedModelSelections = {};
  const current = saved.preferences?.provider;
  const chat = migrate(saved.chat, current, 'chat');
  const translation = migrate(saved.translation, current, 'translation');
  if (chat !== saved.chat) changes.chat = chat;
  if (translation !== saved.translation) changes.translation = translation;

  const selections = { ...saved.preferences?.selections };
  let changed = false;
  for (const [provider, selection] of Object.entries(selections) as [AIProvider, ProviderModelSelection | undefined][]) {
    if (!selection) continue;
    const next = {
      chat: migrate(selection.chat, provider, 'chat') as ChatModel | undefined,
      translation: migrate(selection.translation, provider, 'translation') as TranslateModel | undefined,
    };
    if (next.chat === selection.chat && next.translation === selection.translation) continue;
    selections[provider] = next;
    changed = true;
  }
  if (changed) changes.preferences = { ...saved.preferences!, selections };
  return changes;
}
