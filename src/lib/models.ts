import { debugLog, errorLog } from '@/logs';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogle } from '@langchain/google';
import { ChatOpenAI } from '@langchain/openai';
import { MODELS, type ChatModel, type ModelProvider, type ModelSpec } from '@/lib/modelRegistry';

export * from '@/lib/modelRegistry';

export interface ModelPreset {
  openaiKey?: string;
  geminiKey?: string;
  anthropicKey?: string;
  modelName: ChatModel;
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  // Minimize reasoning for latency-sensitive calls such as translation.
  fast?: boolean;
  // JSON object output. Gemini enforces the schema; OpenAI uses JSON mode; Anthropic relies on the prompt.
  jsonSchema?: Record<string, unknown>;
  modelPreset: ModelPreset;
}

const throwIfMissing = (key: string | undefined, provider: ModelProvider) => {
  if (!key) {
    const providerName =
      provider === 'openai-api-key'
        ? 'OpenAI'
        : provider === 'gemini-api-key'
        ? 'Gemini'
        : 'Anthropic';
    const msg = `${providerName} API key is not set.`;
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
    ...(fast ? { thinkingLevel: 'minimal' as const } : {}),
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

export function getModelInstance(opts: ModelOptions) {
  const spec = MODELS[opts.modelPreset.modelName];
  if (spec.provider === 'openai-api-key') return createOpenAI(spec, opts);
  if (spec.provider === 'gemini-api-key') return createGemini(spec, opts);
  return createAnthropic(spec, opts);
}
