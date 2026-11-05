import { debugLog, errorLog } from '@/logs';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogle } from '@langchain/google';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGPTPlanModel } from '@/lib/chatgptModel';
import type { ReasoningEffort } from '@/lib/reasoning';
import {
  isLocalModel,
  isChatGPTModel,
  chatGPTModelId,
  chatGPTFastEffort,
  localModelId,
  getModelSpec,
  type ApiKeyProvider,
  type ChatModel,
  type ConnectionMode,
  type LocalModelConfig,
  type LocalModelRef,
  type ModelSpec,
} from '@/lib/modelRegistry';

export * from '@/lib/modelRegistry';

export interface ModelPreset {
  openaiKey?: string;
  geminiKey?: string;
  anthropicKey?: string;
  openrouterKey?: string;
  localModel?: LocalModelConfig;
  // Resolved for modelName, not the stored preference.
  connectionMode: ConnectionMode;
  modelName: ChatModel;
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  // Minimize reasoning for latency-sensitive calls such as translation.
  fast?: boolean;
  // The chat's thinking effort when it isn't the model's default (lib/reasoning.ts), or the
  // default the model list sets for the model (defaultThinkingFor). Only for models where
  // modelSupportsReasoningEffort; `fast` wins over it.
  reasoningEffort?: ReasoningEffort;
  // JSON object output. Gemini enforces the schema; OpenAI and OpenRouter use JSON mode;
  // Anthropic relies on the prompt.
  jsonSchema?: Record<string, unknown>;
  // A chat, whose turns all go again with each question: Anthropic caches them (prompt caching),
  // so a long attached page or transcript costs a tenth from the next question on. Not for one-off
  // requests, since writing the cache costs a quarter more than reading the prompt once.
  promptCache?: boolean;
  modelPreset: ModelPreset;
}

// The cache breakpoint goes on the request's last block and moves with the conversation, so each
// turn reads the turns before it. Prompts under the model's minimum length are just not cached.
const PROMPT_CACHE = { cache_control: { type: 'ephemeral' as const } };

const providerNames: Record<ApiKeyProvider, string> = {
  'openai-api-key': 'OpenAI',
  'gemini-api-key': 'Gemini',
  'anthropic-api-key': 'Anthropic',
  'openrouter-api-key': 'OpenRouter',
};

const throwIfMissing = (key: string | undefined, provider: ApiKeyProvider) => {
  if (!key) {
    const msg = `${providerNames[provider]} API key is not set.`;
    errorLog(msg);
    throw new Error(msg);
  }
};

const temperatureFor = (spec: ModelSpec, temperature?: number) =>
  spec.supportsTemperature && temperature !== undefined ? { temperature } : {};

function createOpenAI(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, streaming, fast, reasoningEffort, jsonSchema, modelPreset } = opts;
  throwIfMissing(modelPreset.openaiKey, 'openai-api-key');
  const lowest = spec.openaiFastEffort ?? 'none';
  const effort = fast || reasoningEffort === 'low' ? lowest : reasoningEffort;

  // @langchain/openai only recognizes o-series/gpt-5 as reasoning models, so it would drop
  // `reasoning` and send the legacy `max_tokens` for gpt-6. Pass the raw API fields instead.
  const instance = new ChatOpenAI({
    model: spec.id,
    apiKey: modelPreset.openaiKey!,
    streaming: Boolean(streaming),
    ...temperatureFor(spec, temperature),
    modelKwargs: {
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
      ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
    },
  });

  debugLog('OpenAI instance created:', { model: spec.id, maxTokens, streaming, fast });
  return instance;
}

function createGemini(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, fast, reasoningEffort, jsonSchema, modelPreset } = opts;
  // A thinking level other than minimal also brings the model's thought summaries. A model without
  // 'minimal' thinks at its lowest level on fast calls, with the thoughts left out: a zero budget
  // turns them off, and Gemini 3 and later are sent only the level.
  const fastLevel = fast ? spec.geminiFastEffort : undefined;
  const thinkingLevel = fast || spec.supportsTemperature ? fastLevel ?? 'minimal' : reasoningEffort;
  throwIfMissing(modelPreset.geminiKey, 'gemini-api-key');

  const instance = new ChatGoogle({
    model: spec.id,
    apiKey: modelPreset.geminiKey!,
    ...temperatureFor(spec, temperature),
    ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
    // Gemma (the only Gemini-key model with temperature support) doesn't think by default, but the
    // Gemini API turns thinking on for it, which once streamed a chat reply with no text. Keep it off.
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(fastLevel ? { thinkingBudget: 0 } : {}),
    ...(jsonSchema ? { responseSchema: jsonSchema } : {}),
  });

  debugLog('Gemini instance created:', { model: spec.id, maxTokens, fast });
  return instance;
}

function createAnthropic(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, streaming, fast, reasoningEffort, modelPreset } = opts;
  throwIfMissing(modelPreset.anthropicKey, 'anthropic-api-key');
  // Effort only applies to adaptive-thinking models (those without temperature support). Any set
  // effort above low also turns thinking on, with its summary shown, and leaves room for it: more
  // above 'high', where Anthropic advises a large limit.
  const adaptive = !spec.supportsTemperature;
  const effort = !adaptive ? undefined : fast ? 'low' : reasoningEffort;
  const thinking = adaptive && !fast && reasoningEffort !== undefined && reasoningEffort !== 'low';
  const thinkingRoom = reasoningEffort === 'xhigh' || reasoningEffort === 'max' ? 64_000 : 32_000;

  const instance = new ChatAnthropic({
    model: spec.id,
    apiKey: modelPreset.anthropicKey!,
    streaming: Boolean(streaming),
    ...temperatureFor(spec, temperature),
    ...(maxTokens ? { maxTokens } : thinking ? { maxTokens: thinkingRoom } : {}),
    ...(effort ? { outputConfig: { effort } } : {}),
    ...(thinking ? { thinking: { type: 'adaptive' as const, display: 'summarized' as const } } : {}),
  });

  debugLog('Anthropic instance created:', { model: spec.id, maxTokens, streaming, fast });
  return instance;
}

// OpenRouter speaks the OpenAI Chat Completions API and takes the image_url format for every model.
// With web search on, its web plugin searches first; the citations come only in the raw chunks.
function createOpenRouter(spec: ModelSpec, opts: ModelOptions, webSearch = false) {
  const { maxTokens, temperature, streaming, fast, reasoningEffort, jsonSchema, modelPreset } = opts;
  throwIfMissing(modelPreset.openrouterKey, 'openrouter-api-key');

  const effort =
    fast || reasoningEffort === 'low'
      ? spec.openrouter.fastEffort
      : reasoningEffort ?? spec.openrouter.defaultEffort;
  // The model's thinking comes only in the raw chunks (delta.reasoning), as do web citations.
  const rawChunks = webSearch || (Boolean(streaming) && !fast);
  const reasoning = effort === 'off' ? { enabled: false } : effort ? { effort } : undefined;
  const instance = new ChatOpenAI({
    model: spec.openrouter.id,
    apiKey: modelPreset.openrouterKey!,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      // App attribution: OpenRouter lists usage under shizue.net. The URL is the app's permanent
      // identity there; changing it splits the usage history.
      defaultHeaders: { 'HTTP-Referer': 'https://shizue.net', 'X-OpenRouter-Title': 'Shizue' },
    },
    streaming: Boolean(streaming),
    ...temperatureFor(spec, temperature),
    ...(maxTokens ? { maxTokens } : {}),
    ...(rawChunks ? { __includeRawResponse: true } : {}),
    modelKwargs: {
      ...(reasoning ? { reasoning } : {}),
      ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
      ...(webSearch ? { plugins: [{ id: 'web', max_results: 5 }] } : {}),
    },
  });

  debugLog('OpenRouter instance created:', {
    model: spec.openrouter.id,
    maxTokens,
    streaming,
    fast,
  });
  return instance;
}

// Ollama's own default is 4K tokens on most machines, which silently cuts long pages. Every request
// sends the same value, since a different num_ctx makes Ollama reload the model.
const LOCAL_CONTEXT_LENGTH = 32_768;

// The context Ollama is asked for; chatModelHandler fits long messages into it.
export const localContextLength = (local: LocalModelConfig) =>
  Math.min(local.contextLength ?? LOCAL_CONTEXT_LENGTH, LOCAL_CONTEXT_LENGTH);

function createLocal(model: LocalModelRef, opts: ModelOptions) {
  const { maxTokens, temperature, streaming, fast, reasoningEffort, jsonSchema, modelPreset } = opts;
  const local = modelPreset.localModel;
  if (!local) {
    const msg = `Local model "${localModelId(model)}" is not on the connected server. Connect it again in Settings.`;
    errorLog(msg);
    throw new Error(msg);
  }

  if (local.kind === 'ollama') {
    const instance = new ChatOllama({
      baseUrl: local.baseUrl,
      model: local.model,
      streaming: Boolean(streaming),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens ? { numPredict: maxTokens } : {}),
      numCtx: localContextLength(local),
      ...(local.supportsThinking ? { think: !fast && reasoningEffort === 'high' } : {}),
      ...(jsonSchema ? { format: jsonSchema } : {}),
    });
    debugLog('Ollama instance created:', { model: local.model, maxTokens, streaming });
    return instance;
  }

  const instance = new ChatOpenAI({
    model: local.model,
    // The OpenAI SDK rejects an empty key; servers without auth ignore it.
    apiKey: local.apiKey || 'local',
    configuration: { baseURL: `${local.baseUrl}/v1` },
    streaming: Boolean(streaming),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    modelKwargs: jsonSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'response', strict: true, schema: jsonSchema },
          },
        }
      : {},
  });
  debugLog('Local OpenAI-compatible instance created:', {
    model: local.model,
    maxTokens,
    streaming,
  });
  return instance;
}

// The lowest effort is the one translation uses, known per model; a model without one gets 'low'.
const chatGPTEffort = (model: string, { fast, reasoningEffort }: ModelOptions) =>
  fast ? chatGPTFastEffort(model) : reasoningEffort === 'low' ? chatGPTFastEffort(model) ?? 'low' : reasoningEffort;
// Only the chat streams its answer, and it shows the model's thinking as it comes. A model told
// not to think has none to show.
const chatGPTThinking = (effort: string | undefined, { streaming }: ModelOptions) =>
  Boolean(streaming) && effort !== 'none';

export function getModelInstance(opts: ModelOptions) {
  const { modelName } = opts.modelPreset;
  if (isChatGPTModel(modelName)) {
    const model = chatGPTModelId(modelName);
    const effort = chatGPTEffort(model, opts);
    return new ChatGPTPlanModel(model, Boolean(opts.jsonSchema), effort, false, chatGPTThinking(effort, opts));
  }
  if (isLocalModel(modelName)) return createLocal(modelName, opts);
  const spec = getModelSpec(modelName);
  if (!spec) {
    const msg = `Unknown model: ${modelName}`;
    errorLog(msg);
    throw new Error(msg);
  }
  if (opts.modelPreset.connectionMode === 'openrouter') return createOpenRouter(spec, opts);
  if (spec.provider === 'openai-api-key') return createOpenAI(spec, opts);
  if (spec.provider === 'gemini-api-key') return createGemini(spec, opts);
  const anthropic = createAnthropic(spec, opts);
  return opts.promptCache ? anthropic.withConfig(PROMPT_CACHE) : anthropic;
}

// The chat model with its provider's own web search tool (see modelSupportsWebSearch). The OpenAI
// tool moves the request to the Responses API.
export function getWebSearchModelInstance(opts: ModelOptions) {
  const { modelName, connectionMode } = opts.modelPreset;
  if (isChatGPTModel(modelName)) {
    const model = chatGPTModelId(modelName);
    const effort = chatGPTEffort(model, opts);
    return new ChatGPTPlanModel(model, false, effort, true, chatGPTThinking(effort, opts));
  }
  const spec = isLocalModel(modelName) ? undefined : getModelSpec(modelName);
  if (!spec) throw new Error(`Web search is not available for ${modelName}.`);
  if (connectionMode === 'openrouter') return createOpenRouter(spec, opts, true);
  if (spec.provider === 'openai-api-key') {
    // The search tool moves the request to the Responses API, which has no `reasoning_effort`.
    return createOpenAI(spec, { ...opts, reasoningEffort: undefined }).bindTools([{ type: 'web_search' }]);
  }
  if (spec.provider === 'gemini-api-key') {
    return createGemini(spec, opts).bindTools([{ googleSearch: {} }]);
  }
  const anthropic = createAnthropic(spec, opts).bindTools([
    { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  ]);
  return opts.promptCache ? anthropic.withConfig(PROMPT_CACHE) : anthropic;
}
