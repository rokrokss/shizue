import { STREAM_FLUSH_THRESHOLD_0, STREAM_FLUSH_THRESHOLD_1 } from '@/config/constants';
import { getCurrentLanguage } from '@/entrypoints/background/states/language';
import {
  getCurrentAnthropicKey,
  getCurrentChatModel,
  getCurrentConnectionMode,
  getCurrentGeminiKey,
  getCurrentOpenaiKey,
  getCurrentOpenrouterKey,
} from '@/entrypoints/background/states/models';
import { ActionType } from '@/hooks/global';
import { formatImagesForMessage } from '@/lib/imageFormatHelper';
import { db, loadThread } from '@/lib/indexDB';
import { getModelInstance, ModelPreset, providerFromName } from '@/lib/models';
import { getInitialAIMessage, getInitialSystemMessage } from '@/lib/prompts';
import { trackStreamingTokenUsage } from '@/lib/tokenUsageTracker';
import { debugLog, errorLog } from '@/logs';
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

function getChatModelPreset(): ModelPreset {
  const openaiKey = getCurrentOpenaiKey();
  const geminiKey = getCurrentGeminiKey();
  const anthropicKey = getCurrentAnthropicKey();
  const openrouterKey = getCurrentOpenrouterKey();
  const connectionMode = getCurrentConnectionMode();
  const modelName = getCurrentChatModel();
  return { openaiKey, geminiKey, anthropicKey, openrouterKey, connectionMode, modelName };
}

export class ChatModelHandler {
  constructor() {}

  private async _executeStreamAndUpdate(
    messageId: string,
    messagesForModel: BaseMessage[],
    port: chrome.runtime.Port,
    abortController: AbortController,
    actionType: ActionType
  ) {
    let fullResponseContent = '';

    try {
      const modelPreset = getChatModelPreset();
      const provider = providerFromName(modelPreset.modelName);
      const llm = getModelInstance({
        streaming: true,
        temperature:
          actionType === 'askForSummary' ||
          actionType === 'describeImage' ||
          actionType === 'extractImageText'
            ? 0.3
            : 0.7,
        modelPreset,
      });
      debugLog('ChatModelHandler [_executeStreamAndUpdate] messagesForModel:', messagesForModel);
      const stream = await llm.stream(
        messagesForModel.map((m) => {
          if (m.content == '' && provider === 'gemini-api-key') {
            m.content = ' ';
          }
          return m;
        }),
        { signal: abortController.signal }
      );

      let buffer = '';
      let aggregatedChunk: AIMessageChunk | undefined;

      const sendBufferToPort = () => {
        const threshold = fullResponseContent ? STREAM_FLUSH_THRESHOLD_1 : STREAM_FLUSH_THRESHOLD_0;
        if (buffer.length >= threshold) {
          const currentBuffer = buffer;
          fullResponseContent += currentBuffer;
          buffer = '';
          // DB 업데이트와 포트 메시지는 비동기로 처리하되 순서는 보장
          db.messages.update(messageId, { content: fullResponseContent, done: false }).catch((err) => {
            errorLog('Failed to update message in DB:', err);
          });
          port.postMessage({ delta: currentBuffer });
        }
      };

      for await (const chunk of stream) {
        aggregatedChunk = aggregatedChunk ? aggregatedChunk.concat(chunk) : chunk;
        // `text` skips non-text blocks such as reasoning/thinking content.
        const delta = chunk.text;
        
        // 빈 델타는 무시
        if (!delta) continue;
        
        buffer += delta;
        sendBufferToPort();
      }

      if (buffer) {
        fullResponseContent += buffer;
        await db.messages.update(messageId, { content: fullResponseContent, done: false });
        port.postMessage({ delta: buffer });
      }

      // Track token usage (after streaming is complete)
      if (aggregatedChunk) {
        await trackStreamingTokenUsage(modelPreset, aggregatedChunk);
      }

      port.postMessage({ done: true });
    } catch (err) {
      if (!abortController.signal.aborted) {
        errorLog('ChatModelHandler [_executeStreamAndUpdate] Error during execution:', err);
        const errorMessage = (err as Error).message ?? String(err);
        try {
          port.postMessage({
            error: 'stream_error',
            message: errorMessage,
          });
        } catch (postError) {
          errorLog(
            'ChatModelHandler [_executeStreamAndUpdate] Port already closed while attempting to send stream_error:',
            postError
          );
        } finally {
          await db.messages.update(messageId, {
            content: fullResponseContent,
            onInterrupt: true,
            errorMessage,
          });
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
        actionType: actionType,
        content: '',
        createdAt: Date.now(),
        done: false,
        onInterrupt: false,
        stopped: false,
      });

      const threadHistory = await loadThread(threadId);

      // const memory = (await loadUserMemory()).text; // TODO

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(currentLang);
      const initialAIMessage = getInitialAIMessage(currentLang);
      const modelName = getCurrentChatModel();
      const connectionMode = getCurrentConnectionMode();

      const messages = [
        new SystemMessage(initialSystemMessage),
        new AIMessage(initialAIMessage),
        ...threadHistory.map((m) => {
          if (m.role === 'human') {
            if (m.images && m.images.length > 0) {
              return new HumanMessage({
                content: [
                  ...(m.content ? [{ type: 'text', text: m.content }] : []),
                  ...formatImagesForMessage(m.images, modelName, connectionMode),
                ],
              });
            } else {
              return new HumanMessage(m.content);
            }
          }
          return new AIMessage(m.content);
        }),
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
        errorMessage: undefined,
      });

      // const memory = (await loadUserMemory()).text; // TODO

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(currentLang);
      const initialAIMessage = getInitialAIMessage(currentLang);
      const modelName = getCurrentChatModel();
      const connectionMode = getCurrentConnectionMode();

      const historyForModelInput = fullThreadHistory.slice(0, messageIdxToRetry);

      const messagesForModel: BaseMessage[] = [
        new SystemMessage(initialSystemMessage),
        new AIMessage(initialAIMessage),
        ...historyForModelInput.map((m) => {
          if (m.role === 'human') {
            if (m.images && m.images.length > 0) {
              return new HumanMessage({
                content: [
                  ...(m.content ? [{ type: 'text', text: m.content }] : []),
                  ...formatImagesForMessage(m.images, modelName, connectionMode),
                ],
              });
            } else {
              return new HumanMessage(m.content);
            }
          }
          return new AIMessage(m.content);
        }),
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
}

let chatModelHandler: ChatModelHandler | null = null;

export const getChatModelHandler = (): ChatModelHandler => {
  if (!chatModelHandler) {
    chatModelHandler = new ChatModelHandler();
  }
  return chatModelHandler;
};
