import {
  isSelectionActionType,
  STORAGE_AUTO_MEMORY,
  STORAGE_USER_MEMORY,
  STREAM_FLUSH_THRESHOLD_0,
  STREAM_FLUSH_THRESHOLD_1,
} from '@/config/constants';
import { getCurrentLanguage } from '@/entrypoints/background/states/language';
import {
  getConnectionModeFor,
  getCurrentAnthropicKey,
  getCurrentChatModel,
  getCurrentGeminiKey,
  getCurrentLocalServer,
  getLocalModelFor,
  getCurrentOpenaiKey,
  getCurrentOpenrouterKey,
} from '@/entrypoints/background/states/models';
import { ActionType } from '@/hooks/global';
import type { UserMemory } from '@/hooks/userMemory';
import {
  AutoMemory,
  MEMORY_FACTS_JSON_SCHEMA,
  mergeMemoryFacts,
  parseMemoryFacts,
  questionsToRemember,
  questionText,
} from '@/lib/autoMemory';
import { formatImagesForMessage } from '@/lib/imageFormatHelper';
import { db, loadThread, Message } from '@/lib/indexDB';
import {
  ChatModel,
  ConnectionMode,
  getModelInstance,
  getWebSearchModelInstance,
  isLocalModel,
  localContextLength,
  LocalServerConfig,
  modelSupportsWebSearch,
  ModelPreset,
  providerFromName,
} from '@/lib/models';
import {
  getAttachedPagesPrompt,
  getInitialAIMessage,
  getInitialSystemMessage,
  getMemoryExtractionPrompt,
} from '@/lib/prompts';
import { readStorage, setStorage } from '@/lib/storageBackend';
import { trackStreamingTokenUsage, trackTokenUsage } from '@/lib/tokenUsageTracker';
import { collectWebSources, orderedWebSources, WebSource } from '@/lib/webSources';
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
  const modelName = getCurrentChatModel();
  const localModel = getLocalModelFor(modelName);
  const connectionMode = getConnectionModeFor(modelName);
  return {
    openaiKey,
    geminiKey,
    anthropicKey,
    openrouterKey,
    localModel,
    connectionMode,
    modelName,
  };
}

// Some local models (qwen3.5 on Ollama with thinking off) still open their reply with an empty
// <think></think> block, which arrives as plain text. Returns a filter for the streamed deltas that
// drops a think block at the start of the reply, and the whitespace after it.
const leadingThinkBlockFilter = () => {
  const open = '<think>';
  const close = '</think>';
  let head = '';
  let state: 'head' | 'afterBlock' | 'passing' = 'head';
  return (delta: string): string => {
    if (state === 'passing') return delta;
    if (state === 'afterBlock') {
      const text = delta.trimStart();
      if (text) state = 'passing';
      return text;
    }
    head += delta;
    const trimmed = head.trimStart();
    if (!open.startsWith(trimmed.slice(0, open.length))) {
      state = 'passing';
      return head;
    }
    const end = trimmed.indexOf(close);
    if (end === -1) return '';
    const rest = trimmed.slice(end + close.length).trimStart();
    state = rest ? 'passing' : 'afterBlock';
    return rest;
  };
};

// Room kept for the reply when fitting a local model's context.
const LOCAL_REPLY_TOKENS = 4096;

// Rough token count: Hangul, CJK and kana come to about a token per character, other text to
// about one per 4 characters. qwen3.5:9b read 100K characters of English as about 20K tokens
// (5 characters each); 4 errs toward cutting a little early.
const estimateTextTokens = (text: string) => {
  const wide =
    text.match(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)
      ?.length ?? 0;
  return wide + Math.ceil((text.length - wide) / 4);
};

const textOf = (message: BaseMessage) =>
  typeof message.content === 'string'
    ? message.content
    : message.content.map((part) => (part.type === 'text' ? part.text : '')).join('');

// An image comes to about 1,000 tokens.
const estimateMessageTokens = (message: BaseMessage) =>
  estimateTextTokens(textOf(message)) +
  (typeof message.content === 'string'
    ? 0
    : message.content.filter((part) => part.type !== 'text').length * 1000);

// The longest prefix of `text` estimated at no more than `tokens`, cut between code points.
const truncateToTokens = (text: string, tokens: number) => {
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTextTokens(chars.slice(0, mid).join('')) <= tokens) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join('');
};

// Ollama drops whatever doesn't fit its context without saying so. When the request won't fit,
// cut the end of the longest human message (usually a page sent for a summary, whose instructions
// come first) and report it, so the reply can say it read only part.
const fitLocalContext = (messages: BaseMessage[], contextLength: number) => {
  const budget = contextLength - LOCAL_REPLY_TOKENS;
  const total = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  debugLog('ChatModelHandler [fitLocalContext] estimated tokens:', total, 'budget:', budget);
  if (total <= budget) return { messages, truncated: false };

  let longest = -1;
  messages.forEach((m, i) => {
    if (
      m instanceof HumanMessage &&
      (longest === -1 || textOf(m).length > textOf(messages[longest]).length)
    ) {
      longest = i;
    }
  });
  if (longest === -1) return { messages, truncated: false };

  const original = messages[longest];
  const keep = Math.max(0, estimateTextTokens(textOf(original)) - (total - budget));
  const text = truncateToTokens(textOf(original), keep);
  const fitted = [...messages];
  fitted[longest] = new HumanMessage(
    typeof original.content === 'string'
      ? text
      : {
          content: [
            { type: 'text', text },
            ...original.content.filter((part) => part.type !== 'text'),
          ],
        }
  );
  return { messages: fitted, truncated: true };
};

// The greeting shown at the top of a chat goes to the model as its first turn. Some local chat
// templates (Gemma's in LM Studio) reject an assistant turn before the first user turn.
const initialMessagesFor = (modelName: ChatModel, systemMessage: string, aiMessage: string) =>
  isLocalModel(modelName)
    ? [new SystemMessage(systemMessage)]
    : [new SystemMessage(systemMessage), new AIMessage(aiMessage)];

// A stored message as the model reads it. Attached pages go with their message on every turn, so
// later questions in the chat can still refer to them.
// The facts auto memory keeps, while it is on.
const rememberedFacts = async () => {
  const memory = await readStorage<AutoMemory>(STORAGE_AUTO_MEMORY);
  return memory?.enabled ? memory.facts.map((fact) => fact.text) : [];
};

// Whether the question being answered asked for a web search.
const asksForWebSearch = (history: Message[]) =>
  Boolean([...history].reverse().find((m) => m.role === 'human')?.webSearch);

const toModelMessage = (
  m: Message,
  modelName: ChatModel,
  connectionMode: ConnectionMode,
  localServer?: LocalServerConfig
) => {
  if (m.role !== 'human') return new AIMessage(m.content);
  const text = m.attachments?.length ? getAttachedPagesPrompt(m.content, m.attachments) : m.content;
  if (!m.images?.length) return new HumanMessage(text);
  return new HumanMessage({
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      ...formatImagesForMessage(m.images, modelName, connectionMode, localServer),
    ],
  });
};

export class ChatModelHandler {
  constructor() {}

  private async _executeStreamAndUpdate(
    messageId: string,
    messagesForModel: BaseMessage[],
    port: chrome.runtime.Port,
    abortController: AbortController,
    actionType: ActionType,
    webSearchRequested = false
  ) {
    let fullResponseContent = '';

    try {
      const modelPreset = getChatModelPreset();
      const provider = providerFromName(modelPreset.modelName);
      // The model may have been switched to a local one since the question was asked.
      const webSearch = webSearchRequested && modelSupportsWebSearch(modelPreset.modelName);
      const modelOptions = {
        streaming: true,
        temperature:
          actionType === 'askForSummary' ||
          actionType === 'describeImage' ||
          actionType === 'extractImageText' ||
          isSelectionActionType(actionType)
            ? 0.3
            : 0.7,
        modelPreset,
      };
      const llm = webSearch
        ? getWebSearchModelInstance(modelOptions)
        : getModelInstance(modelOptions);
      const local = modelPreset.localModel;
      const { messages: messagesToSend, truncated } =
        local?.kind === 'ollama'
          ? fitLocalContext(messagesForModel, localContextLength(local))
          : { messages: messagesForModel, truncated: false };
      if (truncated) {
        port.postMessage({ contextTruncated: true });
        await db.messages.update(messageId, { contextTruncated: true });
      }
      debugLog('ChatModelHandler [_executeStreamAndUpdate] messagesForModel:', messagesToSend);
      const stream = await llm.stream(
        messagesToSend.map((m) => {
          if (m.content == '' && provider === 'gemini-api-key') {
            m.content = ' ';
          }
          return m;
        }),
        { signal: abortController.signal }
      );

      let buffer = '';
      let aggregatedChunk: AIMessageChunk | undefined;
      const sources = new Map<string, WebSource & { cited: boolean }>();
      const visibleText =
        isLocalModel(modelPreset.modelName) ? leadingThinkBlockFilter() : (text: string) => text;

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
        if (webSearch) {
          collectWebSources([chunk.content, chunk.response_metadata, chunk.additional_kwargs], sources);
          // OpenRouter's raw chunks carry its citations; merged together they'd only be noise.
          delete chunk.additional_kwargs.__raw_response;
        }
        aggregatedChunk = aggregatedChunk ? aggregatedChunk.concat(chunk) : chunk;
        // `text` skips non-text blocks such as reasoning/thinking content.
        const delta = visibleText(chunk.text);
        
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

      if (sources.size > 0) {
        const found = orderedWebSources(sources);
        await db.messages.update(messageId, { sources: found });
        port.postMessage({ sources: found });
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

      const customInstructions = (await readStorage<UserMemory>(STORAGE_USER_MEMORY))?.text;

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(
        currentLang,
        customInstructions,
        await rememberedFacts()
      );
      const initialAIMessage = getInitialAIMessage(currentLang);
      const modelName = getCurrentChatModel();
      const connectionMode = getConnectionModeFor(modelName);
      const localServer = getCurrentLocalServer();

      const messages = [
        ...initialMessagesFor(modelName, initialSystemMessage, initialAIMessage),
        ...threadHistory.map((m) => toModelMessage(m, modelName, connectionMode, localServer)),
      ];

      await this._executeStreamAndUpdate(
        messageId,
        messages,
        port,
        abortController,
        actionType,
        asksForWebSearch(threadHistory)
      );
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

  // Auto memory: once the user moves on from a chat, the chat model reads the questions asked
  // since the last read and adds the lasting facts about the user it finds.
  private rememberingThreads = new Set<string>();

  public async rememberThread(threadId: string) {
    if (this.rememberingThreads.has(threadId)) return;
    const memory = await readStorage<AutoMemory>(STORAGE_AUTO_MEMORY);
    if (!memory?.enabled) return;
    const thread = await db.threads.get(threadId);
    if (!thread) return;
    const questions = questionsToRemember(await loadThread(threadId), thread.memoryReadAt);
    if (questions.length === 0) return;

    this.rememberingThreads.add(threadId);
    try {
      const modelPreset = getChatModelPreset();
      const local = isLocalModel(modelPreset.modelName);
      const llm = getModelInstance({
        temperature: 0,
        maxTokens: 800,
        // `streaming: false` would make stream() send a single request too.
        streaming: local,
        fast: true,
        modelPreset,
        jsonSchema: MEMORY_FACTS_JSON_SCHEMA,
      });
      const prompt = [
        new HumanMessage(
          getMemoryExtractionPrompt(
            getCurrentLanguage(),
            questions.map(questionText),
            memory.facts.map((fact) => fact.text)
          )
        ),
      ];
      // A slow local model's single response can outlast the service worker's 30-second fetch
      // limit; a streamed one arrives with its first token.
      let response: AIMessage | AIMessageChunk | undefined;
      if (local) {
        for await (const chunk of await llm.stream(prompt)) {
          response = response ? (response as AIMessageChunk).concat(chunk) : chunk;
        }
      } else {
        response = await llm.invoke(prompt);
      }
      if (!response) return;
      await trackTokenUsage(modelPreset, response);

      const added = parseMemoryFacts(response.text);
      debugLog('ChatModelHandler [rememberThread] facts:', added);
      // Settings may have changed while the model was reading.
      const latest = await readStorage<AutoMemory>(STORAGE_AUTO_MEMORY);
      if (!latest?.enabled) return;
      if (added?.length) {
        await setStorage(STORAGE_AUTO_MEMORY, {
          ...latest,
          facts: mergeMemoryFacts(latest.facts, added, Date.now()),
        });
      }
      // A reply that isn't the JSON asked for counts as read too, so the same questions aren't
      // sent again every time the user leaves this chat.
      await db.threads.update(threadId, { memoryReadAt: questions[questions.length - 1].createdAt });
    } catch (err) {
      errorLog('ChatModelHandler [rememberThread] failed:', err);
    } finally {
      this.rememberingThreads.delete(threadId);
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
        contextTruncated: undefined,
        sources: undefined,
      });

      const customInstructions = (await readStorage<UserMemory>(STORAGE_USER_MEMORY))?.text;

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(
        currentLang,
        customInstructions,
        await rememberedFacts()
      );
      const initialAIMessage = getInitialAIMessage(currentLang);
      const modelName = getCurrentChatModel();
      const connectionMode = getConnectionModeFor(modelName);
      const localServer = getCurrentLocalServer();

      const historyForModelInput = fullThreadHistory.slice(0, messageIdxToRetry);

      const messagesForModel: BaseMessage[] = [
        ...initialMessagesFor(modelName, initialSystemMessage, initialAIMessage),
        ...historyForModelInput.map((m) =>
          toModelMessage(m, modelName, connectionMode, localServer)
        ),
      ];

      await this._executeStreamAndUpdate(
        messageIdToRetry,
        messagesForModel,
        port,
        abortController,
        actionType,
        asksForWebSearch(historyForModelInput)
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
