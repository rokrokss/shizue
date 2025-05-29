import { STREAM_FLUSH_THRESHOLD_0, STREAM_FLUSH_THRESHOLD_1 } from '@/config/constants';
import { getCurrentChatModel, getCurrentOpenaiKey } from '@/entrypoints/background/states/models';
import { db, loadThread } from '@/lib/indexDB';
import { getInitialAIMessage, getInitialSystemMessage } from '@/lib/prompts';
import { getCurrentLanguage } from '@/lib/translation';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

interface ModelSettings {
  openaiKey?: string;
  modelName?: string;
  temperature?: number;
}

function getModelSettings(): ModelSettings {
  const openaiKey = getCurrentOpenaiKey();
  const modelName = getCurrentChatModel();
  const temperature = 0.7;
  return { openaiKey, modelName, temperature };
}

export class ModelService {
  constructor() {}

  private async getModelInstance(streaming: boolean = false): Promise<ChatOpenAI> {
    const { openaiKey, modelName, temperature } = getModelSettings();

    if (!openaiKey) {
      const errMsg = 'OpenAI API key is not set. Cannot create LLM instance.';
      errorLog(errMsg);
      throw new Error(errMsg);
    }

    try {
      const llmInstance = new ChatOpenAI({
        modelName,
        temperature,
        apiKey: openaiKey,
        streaming: true,
      });
      debugLog('ModelService: Successfully created a new model instance.');
      return llmInstance;
    } catch (err) {
      errorLog('ModelService: Error during new LLM instance creation:', err);
      throw err;
    }
  }

  public async streamChat(
    threadId: string,
    port: chrome.runtime.Port,
    abortController: AbortController
  ) {
    const messageId = crypto.randomUUID();
    let fullResponseContent = '';

    try {
      await db.messages.add({
        id: messageId,
        threadId,
        role: 'ai',
        content: '',
        createdAt: Date.now(),
        done: false,
        onInterrupt: false,
        stopped: false,
      });

      const threadHistory = await loadThread(threadId);

      const memory = (await loadUserMemory()).text; // TODO

      const initialSystemMessage = getInitialSystemMessage(getCurrentLanguage());
      const initialAIMessage = getInitialAIMessage(getCurrentLanguage());

      const messages = [
        new SystemMessage(initialSystemMessage),
        new AIMessage(initialAIMessage),
        ...threadHistory.map((m) =>
          m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content)
        ),
      ];

      const llm = await this.getModelInstance(true);
      debugLog('ModelService: Starting LLM stream with messages for threadId:', threadId, messages);

      const stream = await llm.stream(messages, { signal: abortController.signal });

      let buffer = '';
      const sendBufferToPort = async () => {
        const threshold = fullResponseContent ? STREAM_FLUSH_THRESHOLD_1 : STREAM_FLUSH_THRESHOLD_0;
        if (buffer.length >= threshold) {
          fullResponseContent += buffer;
          await db.messages.update(messageId, { content: fullResponseContent, done: false });
          port.postMessage({ delta: buffer });
          buffer = '';
        }
      };

      for await (const chunk of stream) {
        const delta = typeof chunk === 'string' ? chunk : (chunk.content as string) ?? '';
        buffer += delta;
        await sendBufferToPort();
      }
      if (buffer) {
        fullResponseContent += buffer;
        await db.messages.update(messageId, { content: fullResponseContent, done: false });
        port.postMessage({ delta: buffer });
      }
      port.postMessage({ done: true });
    } catch (err) {
      if (!abortController.signal.aborted) {
        errorLog('ModelService: Error during streamChat execution:', err);
        try {
          port.postMessage({
            error: 'stream_error',
            message: (err as Error).message ?? String(err),
          });
        } catch (postError) {
          errorLog(
            'ModelService: Port already closed while attempting to send stream_error:',
            postError
          );
        } finally {
          await db.messages.update(messageId, { content: fullResponseContent, onInterrupt: true });
        }
      }
    } finally {
      if (!abortController.signal.aborted) {
        await db.messages.update(messageId, { content: fullResponseContent, done: true });
      } else {
        await db.messages.update(messageId, { content: fullResponseContent, stopped: true });
      }
    }
  }
}

let modelService: ModelService | null = null;

export const getModelService = (): ModelService => {
  if (!modelService) {
    modelService = new ModelService();
  }
  return modelService;
};
