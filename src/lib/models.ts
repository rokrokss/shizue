import { debugLog, errorLog } from '@/logs';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogle } from '@langchain/google';
import { ChatOpenAI } from '@langchain/openai';
import {
  MODELS,
  type ApiKeyProvider,
  type ChatModel,
  type ConnectionMode,
  type ModelSpec,
} from '@/lib/modelRegistry';

export * from '@/lib/modelRegistry';

export interface ModelPreset {
  openaiKey?: string;
  geminiKey?: string;
  anthropicKey?: string;
  openrouterKey?: string;
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
  // JSON object output. Gemini enforces the schema; OpenAI and OpenRouter use JSON mode;
  // Anthropic relies on the prompt.
  jsonSchema?: Record<string, unknown>;
  modelPreset: ModelPreset;
}

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
  const { maxTokens, temperature, streaming, fast, jsonSchema, modelPreset } = opts;
  throwIfMissing(modelPreset.openaiKey, 'openai-api-key');

  // @langchain/openai only recognizes o-series/gpt-5 as reasoning models, so it would drop
  // `reasoning` and send the legacy `max_tokens` for gpt-6. Pass the raw API fields instead.
  const instance = new ChatOpenAI({
    model: spec.id,
    apiKey: modelPreset.openaiKey!,
    streaming: Boolean(streaming),
    ...temperatureFor(spec, temperature),
    modelKwargs: {
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      ...(fast ? { reasoning_effort: 'none' } : {}),
      ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
    },
  });

  debugLog('OpenAI instance created:', { model: spec.id, maxTokens, streaming, fast });
  return instance;
}

function createGemini(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, fast, jsonSchema, modelPreset } = opts;
  throwIfMissing(modelPreset.geminiKey, 'gemini-api-key');

  const instance = new ChatGoogle({
    model: spec.id,
    apiKey: modelPreset.geminiKey!,
    ...temperatureFor(spec, temperature),
    ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
    // Gemma (the only Gemini-key model with temperature support) doesn't think by default, but the
    // Gemini API turns thinking on for it, which once streamed a chat reply with no text. Keep it off.
    ...(fast || spec.supportsTemperature ? { thinkingLevel: 'minimal' as const } : {}),
    ...(jsonSchema ? { responseSchema: jsonSchema } : {}),
  });

  debugLog('Gemini instance created:', { model: spec.id, maxTokens, fast });
  return instance;
}

function createAnthropic(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, streaming, fast, modelPreset } = opts;
  throwIfMissing(modelPreset.anthropicKey, 'anthropic-api-key');

  const instance = new ChatAnthropic({
    model: spec.id,
    apiKey: modelPreset.anthropicKey!,
    streaming: Boolean(streaming),
    ...temperatureFor(spec, temperature),
    ...(maxTokens ? { maxTokens } : {}),
    // Effort only applies to adaptive-thinking models (those without temperature support).
    ...(fast && !spec.supportsTemperature ? { outputConfig: { effort: 'low' as const } } : {}),
  });

  debugLog('Anthropic instance created:', { model: spec.id, maxTokens, streaming, fast });
  return instance;
}

// OpenRouter speaks the OpenAI Chat Completions API and takes the image_url format for every model.
function createOpenRouter(spec: ModelSpec, opts: ModelOptions) {
  const { maxTokens, temperature, streaming, fast, jsonSchema, modelPreset } = opts;
  throwIfMissing(modelPreset.openrouterKey, 'openrouter-api-key');

  const effort = fast ? spec.openrouter.fastEffort : spec.openrouter.defaultEffort;
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
    modelKwargs: {
      ...(reasoning ? { reasoning } : {}),
      ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
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

export function getModelInstance(opts: ModelOptions) {
  const spec = MODELS[opts.modelPreset.modelName];
  if (opts.modelPreset.connectionMode === 'openrouter') return createOpenRouter(spec, opts);
  if (spec.provider === 'openai-api-key') return createOpenAI(spec, opts);
  if (spec.provider === 'gemini-api-key') return createGemini(spec, opts);
  return createAnthropic(spec, opts);
}
