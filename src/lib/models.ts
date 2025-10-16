import { debugLog, errorLog } from '@/logs';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

export type ModelProvider = 'openai-api-key' | 'gemini-api-key' | 'anthropic-api-key';

export type ChatModel =
  | 'gpt'
  | 'gpt-mini'
  | 'gemini-flash'
  | 'gemini-flash-lite'
  | 'claude-sonnet'
  | 'claude-haiku';

export type TranslateModel =
  | 'gpt'
  | 'gpt-mini'
  | 'gemini-flash'
  | 'gemini-flash-lite'
  | 'claude-sonnet'
  | 'claude-haiku';

const displayToRealModelMap: Record<string, string> = {
  gpt: 'gpt-4.1',
  'gpt-mini': 'gpt-4.1-mini',
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-flash-lite': 'gemini-2.5-flash-lite',
  'claude-sonnet': 'claude-sonnet-4-5',
  'claude-haiku': 'claude-haiku-4-5',
};

export interface ModelPreset {
  openaiKey?: string;
  geminiKey?: string;
  anthropicKey?: string;
  modelName: string;
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  modelPreset: ModelPreset;
  responseFormat?: { type: 'json_object' };
}

export const formatModelName = (modelName: string) => {
  if (modelName === 'gpt') {
    return 'GPT 5';
  } else if (modelName === 'gpt-4.1') {
    return 'GPT 4.1';
  } else if (modelName === 'gpt-mini') {
    return 'GPT 5 Mini';
  } else if (modelName === 'gpt-4.1-mini') {
    return 'GPT 4.1 Mini';
  } else if (modelName === 'gemini-2.5-flash' || modelName === 'gemini-flash') {
    return 'Gemini 2.5 Flash';
  } else if (
    modelName === 'gemini-2.5-flash-lite-preview-06-17' ||
    modelName === 'gemini-flash-lite'
  ) {
    return 'Gemini 2.5 Flash Lite';
  } else if (modelName === 'claude-sonnet-4-20250514') {
    return 'Claude Sonnet 4';
  } else if (modelName === 'claude-sonnet') {
    return 'Claude Sonnet 4.5';
  } else if (modelName === 'claude-3-5-haiku-20241022') {
    return 'Claude Haiku 3.5';
  } else if (modelName === 'claude-haiku') {
    return 'Claude Haiku 4.5';
  }

  return modelName;
};

export const providerFromName = (modelName: string): ModelProvider => {
  if (modelName.includes('gemini')) return 'gemini-api-key';
  if (modelName.includes('claude')) return 'anthropic-api-key';
  return 'openai-api-key';
};

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

function createOpenAI({
  maxTokens,
  temperature,
  streaming,
  modelPreset,
  responseFormat,
}: ModelOptions) {
  const { openaiKey, modelName } = modelPreset;
  throwIfMissing(openaiKey, 'openai-api-key');

  const realModelName = displayToRealModelMap[modelName];

  const instance = new ChatOpenAI({
    modelName: realModelName,
    apiKey: openaiKey!,
    temperature: temperature ?? 0.7,
    streaming: Boolean(streaming),
    maxTokens: maxTokens ?? -1,
    ...(responseFormat && { modelKwargs: { response_format: responseFormat } }),
  });

  debugLog('OpenAI instance created:', { realModelName, temperature, maxTokens, streaming });
  return instance;
}

function createGemini({
  maxTokens,
  temperature,
  streaming,
  modelPreset,
  responseFormat,
}: ModelOptions) {
  const { geminiKey, modelName } = modelPreset;
  throwIfMissing(geminiKey, 'gemini-api-key');

  const realModelName = displayToRealModelMap[modelName];

  const instance = new ChatGoogleGenerativeAI({
    model: realModelName,
    apiKey: geminiKey!,
    temperature: temperature ?? 0.7,
    streaming: Boolean(streaming),
    ...(maxTokens && maxTokens > -1 ? { maxOutputTokens: maxTokens } : {}),
    json: Boolean(responseFormat),
  });

  debugLog('Gemini instance created:', { realModelName, temperature, maxTokens, streaming });
  return instance;
}

function createAnthropic({ maxTokens, temperature, streaming, modelPreset }: ModelOptions) {
  const { anthropicKey, modelName } = modelPreset;
  throwIfMissing(anthropicKey, 'anthropic-api-key');

  const realModelName = displayToRealModelMap[modelName];

  const instance = new ChatAnthropic({
    model: realModelName,
    apiKey: anthropicKey!,
    temperature: temperature ?? 0.7,
    streaming: Boolean(streaming),
    ...(maxTokens && maxTokens > -1 ? { maxTokens } : {}),
  });

  debugLog('Anthropic instance created:', { realModelName, temperature, maxTokens, streaming });
  return instance;
}

export function getModelInstance(opts: ModelOptions) {
  const provider = providerFromName(opts.modelPreset.modelName);
  if (provider === 'openai-api-key') return createOpenAI(opts);
  if (provider === 'gemini-api-key') return createGemini(opts);
  return createAnthropic(opts);
}
