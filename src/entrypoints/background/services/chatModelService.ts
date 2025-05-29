import { STREAM_FLUSH_THRESHOLD_0, STREAM_FLUSH_THRESHOLD_1 } from '@/config/constants';
import { getCurrentChatModel, getCurrentOpenaiKey } from '@/entrypoints/background/states/models';
import { db, loadThread } from '@/lib/indexDB';
import { getInitialAIMessage, getInitialSystemMessage } from '@/lib/prompts';
import { getCurrentLanguage } from '@/lib/translation';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

interface ChatModelSettings {
  openaiKey?: string;
  modelName?: string;
  temperature?: number;
}

function getChatModelSettings(): ChatModelSettings {
  const openaiKey = getCurrentOpenaiKey();
  const modelName = getCurrentChatModel();
  const temperature = 0.7;
  return { openaiKey, modelName, temperature };
}

export class ChatModelService {
  constructor() {}

  private async getChatModelInstance(streaming: boolean = false): Promise<ChatOpenAI> {
    const { openaiKey, modelName, temperature } = getChatModelSettings();

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
        streaming: streaming,
      });
      debugLog('ModelService: Successfully created a new model instance.');
      return llmInstance;
    } catch (err) {
      errorLog('ModelService: Error during new LLM instance creation:', err);
      throw err;
    }
  }

  private async _executeStreamAndUpdate(
    messageId: string,
    messagesForModel: BaseMessage[],
    port: chrome.runtime.Port,
    abortController: AbortController
  ) {
    let fullResponseContent = '';

    try {
      const llm = await this.getChatModelInstance(true);
      const stream = await llm.stream(messagesForModel, { signal: abortController.signal });

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
        errorLog('ModelService: [_executeStreamAndUpdate] Error during execution:', err);
        try {
          port.postMessage({
            error: 'stream_error',
            message: (err as Error).message ?? String(err),
          });
        } catch (postError) {
          errorLog(
            'ModelService: [_executeStreamAndUpdate] Port already closed while attempting to send stream_error:',
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

  public async streamChat(
    threadId: string,
    port: chrome.runtime.Port,
    abortController: AbortController
  ) {
    const messageId = crypto.randomUUID();

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

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(currentLang);
      const initialAIMessage = getInitialAIMessage(currentLang);

      const messages = [
        new SystemMessage(initialSystemMessage),
        new AIMessage(initialAIMessage),
        ...threadHistory.map((m) =>
          m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content)
        ),
      ];

      await this._executeStreamAndUpdate(messageId, messages, port, abortController);
    } catch (err) {
      errorLog(`ModelService: [streamChat] error on setup (messageId: ${messageId}):`, err);
      try {
        port.postMessage({ error: 'setup_error', message: (err as Error).message ?? String(err) });
      } catch (postError) {
        errorLog(
          'ModelService: [streamChat] Port already closed while attempting to send setup_error:',
          postError
        );
      }
    }
  }

  public async retryStreamChat(
    threadId: string,
    messageIdxToRetry: number,
    port: chrome.runtime.Port,
    abortController: AbortController
  ) {
    try {
      const fullThreadHistory = await loadThread(threadId);
      debugLog('ModelService: [retryStreamChat] fullThreadHistory:', fullThreadHistory);
      debugLog('ModelService: [retryStreamChat] messageIdxToRetry:', messageIdxToRetry);
      const messageIdToRetry = fullThreadHistory.filter(
        (m) => m.role === 'ai' || m.role === 'human'
      )[messageIdxToRetry].id;

      const messageToRetry = fullThreadHistory[messageIdxToRetry];
      if (!messageToRetry) {
        errorLog(
          `ModelService: [retryStreamChat] message not found in thread history (messageId: ${messageIdToRetry})`
        );
        return;
      }
      if (messageToRetry.role !== 'ai') {
        errorLog(
          `ModelService: [retryStreamChat] cannot retry non-ai message (messageId: ${messageIdToRetry})`
        );
        return;
      }

      await db.messages.update(messageIdToRetry, {
        content: '',
        done: false,
        onInterrupt: false,
        stopped: false,
      });

      const memory = (await loadUserMemory()).text; // TODO

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(currentLang);
      const initialAIMessage = getInitialAIMessage(currentLang);

      const historyForModelInput = fullThreadHistory.slice(0, messageIdxToRetry);

      const messagesForModel: BaseMessage[] = [
        new SystemMessage(initialSystemMessage),
        new AIMessage(initialAIMessage),
        ...historyForModelInput.map((m) =>
          m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content)
        ),
      ];

      await this._executeStreamAndUpdate(messageIdToRetry, messagesForModel, port, abortController);
    } catch (err) {
      errorLog(
        `ModelService: [retryStreamChat] error on setup (messageIdx: ${messageIdxToRetry}):`,
        err
      );
      try {
        port.postMessage({ error: 'setup_error', message: (err as Error).message ?? String(err) });
      } catch (postError) {
        errorLog(
          'ModelService: [retryStreamChat] Port already closed while attempting to send setup_error:',
          postError
        );
      }
    }
  }
}

let chatModelService: ChatModelService | null = null;

export const getChatModelService = (): ChatModelService => {
  if (!chatModelService) {
    chatModelService = new ChatModelService();
  }
  return chatModelService;
};
