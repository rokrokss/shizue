import { debugLog, errorLog } from '@/logs';
import { ChatOpenAI } from '@langchain/openai';

export type ChatModel = 'gpt-4.1' | 'gpt-4.1-mini';
export type TranslateModel = 'gpt-4.1' | 'gpt-4.1-mini';

export interface ModelPreset {
  openaiKey?: string;
  modelName: string;
}

export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  modelPreset: ModelPreset;
  responseFormat?: { type: 'json_object' };
}

export interface OpenAIChatOptions {
  modelName: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  streaming: boolean;
  modelKwargs?: { response_format?: { type: 'json_object' } }; // Added for JSON mode
}

export async function getModelInstance({
  maxTokens = -1,
  temperature = 0.7,
  streaming = false,
  modelPreset,
  responseFormat,
}: ModelOptions): Promise<ChatOpenAI> {
  const { openaiKey, modelName } = modelPreset;

  if (!openaiKey) {
    const errMsg = 'OpenAI API key is not set. Cannot create LLM instance.';
    errorLog(errMsg);
    throw new Error(errMsg);
  }

  try {
    const options: OpenAIChatOptions = {
      modelName,
      temperature,
      apiKey: openaiKey,
      streaming,
      maxTokens,
    };

    if (responseFormat) {
      options.modelKwargs = { response_format: responseFormat };
    }

    const llmInstance = new ChatOpenAI(options);
    debugLog('getModelInstance Successfully created a new model instance with options:', options);
    return llmInstance;
  } catch (err) {
    errorLog('getModelInstance Error during new LLM instance creation:', err);
    throw err;
  }
}
