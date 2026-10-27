// Pure data, safe to import from UI/content scripts (no LangChain imports).
import { getModelList } from '@/lib/modelList';

export type ModelProvider = 'openai-api-key' | 'gemini-api-key' | 'anthropic-api-key';

// OpenRouter serves every model, so it is a key type, never a model's provider.
export type ApiKeyProvider = ModelProvider | 'openrouter-api-key';

// 'direct' calls the model's own provider API; 'openrouter' sends it through OpenRouter.
// A model uses whichever of its provider key and the OpenRouter key is set. The stored setting
// is the preference for when both are.
export type ConnectionMode = 'direct' | 'openrouter';

export const isConnectionMode = (value: unknown): value is ConnectionMode =>
  value === 'direct' || value === 'openrouter';

// Stored in chrome.storage as stable slot names, e.g. 'gpt'. The real model behind each slot comes
// from the model list (modelList.ts), which can add, drop or repoint slots without a release.
export type CloudModel = string;

// A model on the user's own server, stored as 'local:<model id>'. The server, and what each of its
// models supports, is the stored LocalServerConfig. Chat and translation can pick different ones.
export type LocalModelRef = `local:${string}`;

export type ChatGPTModelRef = `chatgpt:${string}`;
export type ChatModel = CloudModel | LocalModelRef | ChatGPTModelRef;
export const isChatGPTModel = (model: string): model is ChatGPTModelRef => model.startsWith('chatgpt:');
export const chatGPTModelRef = (id: string): ChatGPTModelRef => `chatgpt:${id}`;
export const chatGPTModelId = (model: ChatGPTModelRef) => model.slice('chatgpt:'.length);

// App-level exclusions apply to both the account catalog and previously saved selections.
export const isSelectableChatGPTModelId = (id: string): boolean => !getModelList().chatgpt.hidden.includes(id);

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
  // The server app, when the probe can tell (Ollama, LM Studio); shown next to the address.
  serverName?: string;
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
  // Lowest supported reasoning effort for latency-sensitive OpenAI API calls.
  openaiFastEffort?: 'none' | 'low';
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

// Undefined for a slot the current model list doesn't have.
export const getModelSpec = (model: CloudModel): ModelSpec | undefined =>
  getModelList().models.find((spec) => spec.slot === model);

// Reuse verified OpenAI effort settings for the account catalog. Unknown models retain their
// server default rather than receiving a potentially unsupported effort.
export function chatGPTFastEffort(model: string): 'none' | 'low' | undefined {
  const { models, chatgpt } = getModelList();
  if (Object.hasOwn(chatgpt.fastEffort, model)) return chatgpt.fastEffort[model];
  return models.find((spec) => spec.provider === 'openai-api-key' && spec.id === model)?.openaiFastEffort;
}

const LOCAL_PREFIX = 'local:';

export const isLocalModel = (model: ChatModel): model is LocalModelRef =>
  model.startsWith(LOCAL_PREFIX);

export const localModelRef = (id: string): LocalModelRef => `${LOCAL_PREFIX}${id}`;

export const localModelId = (model: LocalModelRef) => model.slice(LOCAL_PREFIX.length);

export const isChatModel = (value: unknown): value is ChatModel =>
  typeof value === 'string' &&
  (Boolean(getModelSpec(value)) || (value.startsWith(LOCAL_PREFIX) && value.length > LOCAL_PREFIX.length) || (isChatGPTModel(value) && value.length > 'chatgpt:'.length));

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
  // The ChatGPT plan Responses flow supports image inputs. The server validates model support.
  isChatGPTModel(model) ? true : isLocalModel(model)
    ? Boolean(resolveLocalModel(model, localServer)?.supportsImages)
    : Boolean(getModelSpec(model)?.supportsImages);

// Usage records written before model IDs were stored hold slot names or retired model IDs.
const legacyModelLabels: Record<string, string> = {
  'gpt-6-sol': 'GPT-6 Sol',
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
  const id = isChatGPTModel(modelName) ? chatGPTModelId(modelName) : modelName;
  const spec = getModelList().models.find((m) => m.id === id);
  return spec?.label ?? legacyModelLabels[id] ?? id;
};

export const providerFromName = (modelName: string): ModelProvider => {
  if (modelName.includes('gemini')) return 'gemini-api-key';
  if (modelName.includes('claude')) return 'anthropic-api-key';
  return 'openai-api-key';
};
