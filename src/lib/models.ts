import { debugLog, errorLog } from '@/logs';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

export type ModelProvider = 'openai-api-key' | 'gemini-api-key';

export type ChatModel =
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite-preview-06-17';

export type TranslateModel =
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite-preview-06-17';

export interface ModelPreset {
  openaiKey?: string;
  geminiKey?: string;
  modelName: string;
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  modelPreset: ModelPreset;
  responseFormat?: { type: 'json_object' };
}

const providerFromName = (modelName: string): ModelProvider =>
  modelName.includes('gemini') ? 'gemini-api-key' : 'openai-api-key';

const throwIfMissing = (key: string | undefined, provider: ModelProvider) => {
  if (!key) {
    const msg = `${provider === 'openai-api-key' ? 'OpenAI' : 'Gemini'} API key is not set.`;
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

  const instance = new ChatOpenAI({
    modelName,
    apiKey: openaiKey!,
    temperature: temperature ?? 0.7,
    streaming: Boolean(streaming),
    maxTokens: maxTokens ?? -1,
    ...(responseFormat && { modelKwargs: { response_format: responseFormat } }),
  });

  debugLog('OpenAI instance created:', { modelName, temperature, maxTokens, streaming });
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

  const instance = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: geminiKey!,
    temperature: temperature ?? 0.7,
    streaming: Boolean(streaming),
    ...(maxTokens && maxTokens > -1 ? { maxOutputTokens: maxTokens } : {}),
    json: Boolean(responseFormat),
  });

  debugLog('Gemini instance created:', { modelName, temperature, maxTokens, streaming });
  return instance;
}

export function getModelInstance(opts: ModelOptions) {
  return providerFromName(opts.modelPreset.modelName) === 'openai-api-key'
    ? createOpenAI(opts)
    : createGemini(opts);
}
