import { recordTokenUsage } from '@/lib/indexDB';
import { debugLog } from '@/logs';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Common token usage extraction function
export const extractTokenUsage = (response: AIMessageChunk | AIMessage): TokenUsageInfo | undefined => {
  const usage = response?.usage_metadata;
  if (usage) {
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }
};

// Record token usage to database
export const trackTokenUsage = async (
  model: string,
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
    const provider = model.includes('openai') ? 'openai' : 'gemini';

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

// Track token usage from streaming response (final chunk)
export const trackStreamingTokenUsage = async (
  model: string,
  finalResponse: AIMessageChunk,
): Promise<void> => {
  await trackTokenUsage(model, finalResponse, 1);
};
