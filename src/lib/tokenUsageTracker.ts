import { recordTokenUsage } from '@/lib/indexDB';
import { isLocalModel, localModelId, MODELS } from '@/lib/modelRegistry';
import type { ModelPreset } from '@/lib/models';
import { debugLog } from '@/logs';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const extractTokenUsage = (
  response: AIMessageChunk | AIMessage
): TokenUsageInfo | undefined => {
  const usage = response?.usage_metadata;
  if (usage) {
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
};

export const trackTokenUsage = async (
  modelPreset: ModelPreset,
  response: AIMessageChunk | AIMessage,
  requestCount: number = 1
): Promise<void> => {
  try {
    const usage = extractTokenUsage(response);
    debugLog('Token usage response:', response);
    if (!usage) {
      debugLog('No token usage found in response');
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { modelName } = modelPreset;
    const model = isLocalModel(modelName) ? localModelId(modelName) : MODELS[modelName].id;
    const providerKey = isLocalModel(modelName) ? undefined : MODELS[modelName].provider;
    const provider =
      isLocalModel(modelName)
        ? 'local'
        : modelPreset.connectionMode === 'openrouter'
        ? 'openrouter'
        : providerKey === 'anthropic-api-key'
        ? 'anthropic'
        : providerKey === 'gemini-api-key'
        ? 'gemini'
        : 'openai';

    await recordTokenUsage({
      date: today,
      model: model,
      provider: provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      requestCount,
      createdAt: Date.now(),
    });

    debugLog('Token usage recorded:', {
      model: model,
      provider,
      usage,
      requestCount,
    });
  } catch (error) {
    debugLog('Error tracking token usage:', error);
  }
};

// Pass the concatenation of all streamed chunks: providers split usage across chunks.
export const trackStreamingTokenUsage = async (
  modelPreset: ModelPreset,
  aggregatedResponse: AIMessageChunk
): Promise<void> => {
  await trackTokenUsage(modelPreset, aggregatedResponse, 1);
};
