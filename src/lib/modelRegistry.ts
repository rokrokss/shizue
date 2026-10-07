// Pure data, safe to import from UI/content scripts (no LangChain imports).
export type ModelProvider = 'openai-api-key' | 'gemini-api-key' | 'anthropic-api-key';

// OpenRouter serves every model, so it is a key type, never a model's provider.
export type ApiKeyProvider = ModelProvider | 'openrouter-api-key';

// 'direct' calls the model's own provider API; 'openrouter' sends it through OpenRouter.
// A model uses whichever of its provider key and the OpenRouter key is set. The stored setting
// is the preference for when both are.
export type ConnectionMode = 'direct' | 'openrouter';

export const isConnectionMode = (value: unknown): value is ConnectionMode =>
  value === 'direct' || value === 'openrouter';

// Stored in chrome.storage as stable slot names; the real model behind each slot is in MODELS.
export type ChatModel =
  | 'gpt'
  | 'gpt-mini'
  | 'gemini-flash'
  | 'gemini-flash-lite'
  | 'gemma'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'deepseek-pro'
  | 'deepseek-flash';

export type TranslateModel = ChatModel;

export interface ModelSpec {
  id: string;
  label: string;
  // Unset for models served only through OpenRouter.
  provider?: ModelProvider;
  // Newer reasoning models reject (or ignore) non-default sampling temperature.
  supportsTemperature: boolean;
  // Whether the model takes image input (`input_modalities` on OpenRouter).
  supportsImages: boolean;
  openrouter: {
    // OpenRouter IDs don't follow the provider's (claude-haiku-4-5 is anthropic/claude-haiku-4.5).
    id: string;
    // `reasoning.effort` for fast calls, from the model's `supported_efforts` on OpenRouter.
    // 'off' sends `reasoning.enabled: false`, for models with a non-thinking mode but no 'none' effort.
    // Unset when reasoning is off by default, since sending an effort would turn it on.
    fastEffort?: 'none' | 'minimal' | 'low' | 'off';
    // OpenRouter's `default_effort`, sent on regular calls when the model lists no `default_enabled`:
    // its providers then disagree on whether to think by default.
    defaultEffort?: 'high';
  };
}

export const MODELS: Record<ChatModel, ModelSpec> = {
  gpt: {
    id: 'gpt-6-sol',
    label: 'GPT-6 Sol',
    provider: 'openai-api-key',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'openai/gpt-6-sol', fastEffort: 'none' },
  },
  'gpt-mini': {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    provider: 'openai-api-key',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'openai/gpt-6-luna', fastEffort: 'none' },
  },
  'gemini-flash': {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'gemini-api-key',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'google/gemini-3.8-flash', fastEffort: 'low' },
  },
  'gemini-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini-api-key',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'google/gemini-3.5-flash-lite', fastEffort: 'minimal' },
  },
  gemma: {
    id: 'gemma-4-31b-it',
    label: 'Gemma 4 31B',
    provider: 'gemini-api-key',
    supportsTemperature: true,
    supportsImages: true,
    openrouter: { id: 'google/gemma-4-31b-it' },
  },
  'claude-sonnet': {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'anthropic-api-key',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'anthropic/claude-sonnet-5', fastEffort: 'low' },
  },
  'claude-haiku': {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic-api-key',
    supportsTemperature: true,
    supportsImages: true,
    openrouter: { id: 'anthropic/claude-haiku-4.5' },
  },
  'deepseek-pro': {
    id: 'deepseek-v4-pro-0813',
    label: 'DeepSeek V4 Pro',
    supportsTemperature: false,
    supportsImages: false,
    openrouter: {
      id: 'deepseek/deepseek-v4-pro-0813',
      fastEffort: 'off',
      defaultEffort: 'high',
    },
  },
  'deepseek-flash': {
    id: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    supportsTemperature: false,
    supportsImages: true,
    openrouter: { id: 'deepseek/deepseek-v4.1-flash', fastEffort: 'off' },
  },
};

export const MODEL_OPTIONS = Object.keys(MODELS) as ChatModel[];

export const isChatModel = (value: unknown): value is ChatModel =>
  typeof value === 'string' && value in MODELS;

// Usage records written before model IDs were stored hold slot names or retired model IDs.
const legacyModelLabels: Record<string, string> = {
  gpt: 'GPT 4.1',
  'gpt-4.1': 'GPT 4.1',
  'gpt-mini': 'GPT 4.1 Mini',
  'gpt-4.1-mini': 'GPT 4.1 Mini',
  'gemini-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-flash-lite-preview-06-17': 'Gemini 2.5 Flash Lite',
  'claude-sonnet': 'Claude Sonnet 4.5',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-haiku': 'Claude Haiku 4.5',
  'claude-3-5-haiku-20241022': 'Claude Haiku 3.5',
};

export const formatModelName = (modelName: string) => {
  const spec = Object.values(MODELS).find((m) => m.id === modelName);
  return spec?.label ?? legacyModelLabels[modelName] ?? modelName;
};

export const providerFromName = (modelName: string): ModelProvider => {
  if (modelName.includes('gemini')) return 'gemini-api-key';
  if (modelName.includes('claude')) return 'anthropic-api-key';
  return 'openai-api-key';
};
