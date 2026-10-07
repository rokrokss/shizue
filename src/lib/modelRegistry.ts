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
export type CloudModel =
  | 'gpt'
  | 'gpt-mini'
  | 'gemini-flash'
  | 'gemini-flash-lite'
  | 'gemma'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'deepseek-pro'
  | 'deepseek-flash';

// A model on the user's own server, stored as 'local:<model id>'. The server, and what each of its
// models supports, is the stored LocalServerConfig. Chat and translation can pick different ones.
export type LocalModelRef = `local:${string}`;

export type ChatModel = CloudModel | LocalModelRef;

export type TranslateModel = ChatModel;

// Ollama gets its own API, which can set the context length per request; other servers use /v1.
export type LocalServerKind = 'ollama' | 'openai-compatible';

export interface LocalServerModel {
  id: string;
  supportsImages: boolean;
  // Thinking runs before any text and is slow locally, so it is turned off when the model has it.
  supportsThinking: boolean;
  // The model's own maximum, when the server reports it (Ollama).
  contextLength?: number;
}

// The connected server and its chat models, saved when the user connects.
export interface LocalServerConfig {
  kind: LocalServerKind;
  // Server root without /v1, e.g. http://localhost:11434.
  baseUrl: string;
  // Some OpenAI-compatible servers (Jan, vLLM --api-key) require one.
  apiKey?: string;
  models: LocalServerModel[];
}

// What the model factory needs to call one local model.
export interface LocalModelConfig {
  kind: LocalServerKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  supportsImages: boolean;
  supportsThinking: boolean;
  contextLength?: number;
}

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

export const MODELS: Record<CloudModel, ModelSpec> = {
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

export const MODEL_OPTIONS = Object.keys(MODELS) as CloudModel[];

const LOCAL_PREFIX = 'local:';

export const isLocalModel = (model: ChatModel): model is LocalModelRef =>
  model.startsWith(LOCAL_PREFIX);

export const localModelRef = (id: string): LocalModelRef => `${LOCAL_PREFIX}${id}`;

export const localModelId = (model: LocalModelRef) => model.slice(LOCAL_PREFIX.length);

export const isChatModel = (value: unknown): value is ChatModel =>
  typeof value === 'string' &&
  (value in MODELS || (value.startsWith(LOCAL_PREFIX) && value.length > LOCAL_PREFIX.length));

// Undefined when the model isn't on the connected server (e.g. after connecting another one).
export const resolveLocalModel = (
  model: LocalModelRef,
  server?: LocalServerConfig | null
): LocalModelConfig | undefined => {
  const id = localModelId(model);
  const found = server?.models.find((m) => m.id === id);
  if (!server || !found) return undefined;
  return {
    kind: server.kind,
    baseUrl: server.baseUrl,
    apiKey: server.apiKey,
    model: id,
    supportsImages: found.supportsImages,
    supportsThinking: found.supportsThinking,
    contextLength: found.contextLength,
  };
};

export const modelSupportsImages = (model: ChatModel, localServer?: LocalServerConfig | null) =>
  isLocalModel(model)
    ? Boolean(resolveLocalModel(model, localServer)?.supportsImages)
    : MODELS[model].supportsImages;

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
