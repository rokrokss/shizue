import { STREAM_FLUSH_THRESHOLD_0, STREAM_FLUSH_THRESHOLD_1 } from '@/config/constants';
import {
  getCurrentLanguage,
  getTranslationTargetLanguage,
} from '@/entrypoints/background/states/language';
import {
  getCurrentChatModel,
  getCurrentOpenaiKey,
  getCurrentTranslateModel,
} from '@/entrypoints/background/states/models';
import { ActionType } from '@/hooks/global';
import { db, loadThread } from '@/lib/indexDB';
import {
  getHtmlTranslationPrompt,
  getInitialAIMessage,
  getInitialSystemMessage,
} from '@/lib/prompts';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

interface ModelPreset {
  openaiKey?: string;
  modelName: string;
}

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  error?: string;
}

interface ModelOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  modelPreset?: ModelPreset;
}

interface OpenAIChatOptions {
  modelName: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  streaming: boolean;
}

function getChatModelPreset(): ModelPreset {
  const openaiKey = getCurrentOpenaiKey();
  const modelName = getCurrentChatModel();
  return { openaiKey, modelName };
}

function getTranslationModelPreset(): ModelPreset {
  const openaiKey = getCurrentOpenaiKey();
  const modelName = getCurrentTranslateModel();
  return { openaiKey, modelName };
}

export class ChatModelHandler {
  constructor() {}

  private async getModelInstance({
    maxTokens = -1,
    temperature = 0.7,
    streaming = false,
    modelPreset = getChatModelPreset(),
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
      const llmInstance = new ChatOpenAI(options);
      debugLog('ChatModelHandler Successfully created a new model instance with options:', options);
      return llmInstance;
    } catch (err) {
      errorLog('ChatModelHandler Error during new LLM instance creation:', err);
      throw err;
    }
  }

  private async _executeStreamAndUpdate(
    messageId: string,
    messagesForModel: BaseMessage[],
    port: chrome.runtime.Port,
    abortController: AbortController,
    actionType: ActionType
  ) {
    let fullResponseContent = '';

    try {
      const llm = await this.getModelInstance({
        streaming: true,
        temperature: actionType === 'askForSummary' ? 0.3 : 0.7,
      });
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
        errorLog('ChatModelHandler [_executeStreamAndUpdate] Error during execution:', err);
        try {
          port.postMessage({
            error: 'stream_error',
            message: (err as Error).message ?? String(err),
          });
        } catch (postError) {
          errorLog(
            'ChatModelHandler [_executeStreamAndUpdate] Port already closed while attempting to send stream_error:',
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
    abortController: AbortController,
    actionType: ActionType
  ) {
    const messageId = crypto.randomUUID();

    try {
      await db.messages.add({
        id: messageId,
        threadId,
        role: 'ai',
        actionType: 'chat',
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

      await this._executeStreamAndUpdate(messageId, messages, port, abortController, actionType);
    } catch (err) {
      errorLog(`ChatModelHandler [streamChat] error on setup (messageId: ${messageId}):`, err);
      try {
        port.postMessage({ error: 'setup_error', message: (err as Error).message ?? String(err) });
      } catch (postError) {
        errorLog(
          'ChatModelHandler [streamChat] Port already closed while attempting to send setup_error:',
          postError
        );
      }
    }
  }

  public async retryStreamChat(
    threadId: string,
    messageIdxToRetry: number,
    port: chrome.runtime.Port,
    abortController: AbortController,
    actionType: ActionType
  ) {
    try {
      const fullThreadHistory = await loadThread(threadId);
      debugLog('ChatModelHandler [retryStreamChat] fullThreadHistory:', fullThreadHistory);
      debugLog('ChatModelHandler [retryStreamChat] messageIdxToRetry:', messageIdxToRetry);
      const messageIdToRetry = fullThreadHistory.filter(
        (m) => m.role === 'ai' || m.role === 'human'
      )[messageIdxToRetry].id;

      const messageToRetry = fullThreadHistory[messageIdxToRetry];
      if (!messageToRetry) {
        errorLog(
          `ChatModelHandler [retryStreamChat] message not found in thread history (messageId: ${messageIdToRetry})`
        );
        return;
      }
      if (messageToRetry.role !== 'ai') {
        errorLog(
          `ChatModelHandler [retryStreamChat] cannot retry non-ai message (messageId: ${messageIdToRetry})`
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

      await this._executeStreamAndUpdate(
        messageIdToRetry,
        messagesForModel,
        port,
        abortController,
        actionType
      );
    } catch (err) {
      errorLog(
        `ChatModelHandler [retryStreamChat] error on setup (messageIdx: ${messageIdxToRetry}):`,
        err
      );
      try {
        port.postMessage({ error: 'setup_error', message: (err as Error).message ?? String(err) });
      } catch (postError) {
        errorLog(
          'ChatModelHandler [retryStreamChat] Port already closed while attempting to send setup_error:',
          postError
        );
      }
    }
  }

  public async translateHtmlText(text: string): Promise<TranslationResult> {
    try {
      const targetLanguage = getTranslationTargetLanguage();
      const prompt = getHtmlTranslationPrompt(text, targetLanguage);

      const llm = await this.getModelInstance({
        temperature: 0.3,
        maxTokens: 2000,
        streaming: false,
        modelPreset: getTranslationModelPreset(),
      });
      const response = await llm.invoke([new HumanMessage(prompt)]);

      debugLog('ChatModelHandler [translateText] response:', response);

      return { success: true, translatedText: (response.content as string).trim() };
    } catch (err) {
      errorLog('ChatModelHandler [translateText] error:', err);
      return { success: false, error: (err as Error).message ?? String(err) };
    }
  }
}

let chatModelHandler: ChatModelHandler | null = null;

export const getChatModelHandler = (): ChatModelHandler => {
  if (!chatModelHandler) {
    chatModelHandler = new ChatModelHandler();
  }
  return chatModelHandler;
};
