import {
  isSelectionActionType,
  STORAGE_AUTO_MEMORY,
  STORAGE_REASONING_EFFORT,
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
  modelSupportsReasoningEffort,
  modelSupportsWebSearch,
  ModelPreset,
  providerFromName,
} from '@/lib/models';
import {
  FOLLOW_UP_QUESTIONS_JSON_SCHEMA,
  getAttachedPagesPrompt,
  getConversationSummaryPrompt,
  getFollowUpQuestionsPrompt,
  getInitialAIMessage,
  getInitialSystemMessage,
  getMemoryExtractionPrompt,
  getVideoMomentPrompt,
  withConversationSummary,
} from '@/lib/prompts';
import { formatVideoTime } from '@/lib/videoTranscript';
import { chunkParts, isReasoningEffort, ReasoningEffort, thinkTagSplitter } from '@/lib/reasoning';
import { CLOUD_CONTEXT_TOKENS, planCompaction } from '@/lib/chatCompaction';
import { readStorage, setStorage } from '@/lib/storageBackend';
import { trackStreamingTokenUsage, trackTokenUsage } from '@/lib/tokenUsageTracker';
import { collectWebSources, orderedWebSources, WebSource } from '@/lib/webSources';
import { type AgentLabels, browserControlMarkSplitter } from '@/lib/browserAgent';
import { runBrowserAgent } from '@/services/background/browserAgentHandler';
import { debugLog, errorLog } from '@/logs';
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

export function getChatModelPreset(): ModelPreset {
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

// The chat's thinking effort, for a model that takes one; undefined is the model's default.
const reasoningEffortFor = async (modelName: ChatModel) => {
  const stored = await readStorage<ReasoningEffort>(STORAGE_REASONING_EFFORT);
  if (!isReasoningEffort(stored) || stored === 'medium') return undefined;
  return modelSupportsReasoningEffort(modelName, getCurrentLocalServer()) ? stored : undefined;
};

// The model's suggested questions: at most three, each short, none twice.
const parseQuestions = (text: string): string[] => {
  try {
    const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const questions = JSON.parse(json)?.questions;
    if (!Array.isArray(questions)) return [];
    const seen = new Set<string>();
    return questions
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.replace(/\s+/g, ' ').trim())
      .filter((q) => q && q.length <= 150 && !seen.has(q) && seen.add(q))
      .slice(0, 3);
  } catch {
    return [];
  }
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

// The question being answered, when it asked the browser agent to do it in the tab.
const agentTask = (history: Message[]) => {
  const question = [...history].reverse().find((m) => m.role === 'human');
  return question?.browserAgent ? question : null;
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
  const question = m.videoMoment
    ? getVideoMomentPrompt(formatVideoTime(m.videoMoment.seconds), m.content)
    : m.content;
  const text = m.attachments?.length ? getAttachedPagesPrompt(question, m.attachments) : question;
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

  // An answer by the browser agent (services/background/browserAgentHandler.ts): the chat before
  // the task goes with it, a question and its answer at a time.
  private async runAgentAnswer(
    messageId: string,
    history: Message[],
    task: Message,
    port: chrome.runtime.Port,
    abortController: AbortController,
    labels?: AgentLabels
  ) {
    try {
      const modelPreset = getChatModelPreset();
      const { connectionMode, modelName } = modelPreset;
      const localServer = getCurrentLocalServer() ?? undefined;
      const earlier: BaseMessage[] = [];
      const before = history.slice(0, history.indexOf(task)).filter((m) => m.content.trim()).slice(-6);
      for (const m of before) {
        const role = m.role === 'human' ? 'human' : 'ai';
        // Providers want the turns to alternate, starting with a question.
        if (earlier.length === 0 && role === 'ai') continue;
        if (earlier.length > 0 && (earlier[earlier.length - 1] instanceof HumanMessage) === (role === 'human')) {
          earlier.pop();
        }
        earlier.push(toModelMessage({ ...m, attachments: undefined, images: undefined }, modelName, connectionMode, localServer));
      }
      if (earlier.length > 0 && earlier[earlier.length - 1] instanceof HumanMessage) earlier.pop();
      await runBrowserAgent({
        messageId,
        task: task.content,
        history: earlier,
        lang: getCurrentLanguage(),
        labels,
        reasoningEffort: await reasoningEffortFor(modelName),
        modelPreset,
        port,
        signal: abortController.signal,
      });
      if (!abortController.signal.aborted) port.postMessage({ done: true });
    } catch (err) {
      if (abortController.signal.aborted) return;
      errorLog('ChatModelHandler [runAgentAnswer] failed:', err);
      const errorMessage = (err as Error).message ?? String(err);
      try {
        port.postMessage({ error: 'stream_error', message: errorMessage });
      } catch {
        // The panel is gone.
      }
      await db.messages.update(messageId, { onInterrupt: true, errorMessage });
    } finally {
      await db.messages.update(messageId, abortController.signal.aborted ? { stopped: true } : { done: true });
    }
  }

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
        reasoningEffort: await reasoningEffortFor(modelPreset.modelName),
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
      const splitThinkTag = isLocalModel(modelPreset.modelName) ? thinkTagSplitter() : null;
      // An answer that starts with the browser control mark (prompts.ts) shows the panel's offer
      // to turn browser control on, without the mark.
      const markSplitter = browserControlMarkSplitter();
      // The thinking the model shows before it answers goes to the panel as it comes, and how
      // long it thought once the answer starts.
      let reasoning = '';
      let reasoningBuffer = '';
      let thinkingStartedAt: number | undefined;
      let thinkingMs: number | undefined;
      const sendReasoning = (force = false) => {
        if (!reasoningBuffer || (!force && reasoningBuffer.length < STREAM_FLUSH_THRESHOLD_0)) return;
        reasoning += reasoningBuffer;
        port.postMessage({ reasoning: reasoningBuffer });
        reasoningBuffer = '';
        db.messages.update(messageId, { reasoning }).catch((err) => {
          errorLog('Failed to update message reasoning in DB:', err);
        });
      };

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
        }
        const parts = chunkParts(chunk);
        // OpenRouter's raw chunks were only needed for the thinking and the citations.
        delete chunk.additional_kwargs.__raw_response;
        aggregatedChunk = aggregatedChunk ? aggregatedChunk.concat(chunk) : chunk;
        const tagged = splitThinkTag ? splitThinkTag(parts.text) : { text: parts.text, reasoning: '' };
        const thought = parts.reasoning + tagged.reasoning;
        const delta = tagged.text;
        if (thought && !fullResponseContent && !buffer) {
          thinkingStartedAt ??= Date.now();
          reasoningBuffer += thought;
          sendReasoning();
        }

        // 빈 델타는 무시
        if (!delta) continue;

        if (thinkingStartedAt !== undefined && thinkingMs === undefined) {
          sendReasoning(true);
          thinkingMs = Date.now() - thinkingStartedAt;
          port.postMessage({ thinkingMs });
          await db.messages.update(messageId, { reasoning, thinkingMs });
        }
        const split = markSplitter.push(delta);
        if (split.marked) {
          port.postMessage({ browserControlHint: true });
          await db.messages.update(messageId, { browserControlHint: true });
        }
        if (!split.text) continue;
        buffer += split.text;
        sendBufferToPort();
      }
      buffer += markSplitter.flush();
      sendReasoning(true);

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
    actionType: ActionType,
    agentLabels?: AgentLabels
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
      const task = agentTask(threadHistory);
      if (task) {
        await this.runAgentAnswer(messageId, threadHistory, task, port, abortController, agentLabels);
        return;
      }

      const customInstructions = (await readStorage<UserMemory>(STORAGE_USER_MEMORY))?.text;

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(
        currentLang,
        customInstructions,
        await rememberedFacts()
      );
      const initialAIMessage = getInitialAIMessage(currentLang);

      const messages = await this.compactedMessages(
        threadId,
        messageId,
        threadHistory,
        initialSystemMessage,
        initialAIMessage,
        port
      );

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

  // The request for an answer: the system message, then the thread as the model reads it. A long
  // thread's older turns go as a summary in the system message (lib/chatCompaction.ts). Tells the
  // panel how much of the context it fills, and whether this answer folded turns into the summary.
  private async compactedMessages(
    threadId: string,
    answerId: string,
    history: Message[],
    systemMessage: string,
    greeting: string,
    port: chrome.runtime.Port
  ): Promise<BaseMessage[]> {
    const modelName = getCurrentChatModel();
    const connectionMode = getConnectionModeFor(modelName);
    const localServer = getCurrentLocalServer();
    const local = getLocalModelFor(modelName);
    const budget = local ? localContextLength(local) : CLOUD_CONTEXT_TOKENS;
    const modelMessages = history.map((m) => toModelMessage(m, modelName, connectionMode, localServer));
    const fixed = estimateTextTokens(systemMessage) + estimateTextTokens(greeting);
    const thread = await db.threads.get(threadId);
    let plan = planCompaction(
      history,
      modelMessages.map(estimateMessageTokens),
      fixed,
      thread?.contextSummary,
      budget,
      estimateTextTokens
    );
    let compacted = false;
    if (plan.fold) {
      const { from, to } = plan.fold;
      const text = await this.summarizeTurns(plan.summary, history.slice(from, to));
      if (text) {
        const until = history[to - 1].createdAt;
        await db.threads.update(threadId, { contextSummary: { text, until, count: to } });
        const tokens =
          fixed +
          estimateTextTokens(text) +
          modelMessages.slice(to).reduce((sum, m) => sum + estimateMessageTokens(m), 0);
        plan = { keepFrom: to, summary: text, tokens };
        compacted = true;
      }
    }
    const contextUsage = Math.min(1, plan.tokens / budget);
    try {
      port.postMessage({ contextUsage, contextCompacted: compacted });
    } catch {
      // The panel went away; the answer is still saved.
    }
    await db.messages.update(answerId, { contextUsage, ...(compacted ? { contextCompacted: true } : {}) });
    const system = plan.summary ? withConversationSummary(systemMessage, plan.summary) : systemMessage;
    return [...initialMessagesFor(modelName, system, greeting), ...modelMessages.slice(plan.keepFrom)];
  }

  // The turns folded into a long chat's summary, with the summary before them. Each message is cut
  // to a few thousand characters, so the request stays small however long the pages attached were.
  private async summarizeTurns(previous: string | undefined, turns: Message[]): Promise<string | null> {
    try {
      const modelPreset = getChatModelPreset();
      const local = isLocalModel(modelPreset.modelName);
      const llm = getModelInstance({
        temperature: 0.2,
        maxTokens: 1500,
        streaming: local,
        fast: true,
        modelPreset,
      });
      const prompt = [
        new HumanMessage(
          getConversationSummaryPrompt(
            getCurrentLanguage(),
            previous,
            turns.map((m) => ({
              role: m.role,
              text: (m.attachments?.length
                ? `${m.content}\n(attached: ${m.attachments.map((page) => page.title || page.url).join(', ')})\n${m.attachments.map((page) => page.text).join('\n')}`
                : m.content
              ).slice(0, 3000),
            }))
          )
        ),
      ];
      let response: AIMessage | AIMessageChunk | undefined;
      if (local) {
        for await (const chunk of await llm.stream(prompt)) {
          response = response ? (response as AIMessageChunk).concat(chunk) : chunk;
        }
      } else {
        response = await llm.invoke(prompt);
      }
      if (!response) return null;
      await trackTokenUsage(modelPreset, response);
      return response.text.trim() || null;
    } catch (err) {
      errorLog('ChatModelHandler [summarizeTurns] failed:', err);
      return null;
    }
  }

  // Up to three questions to ask next, under a summary that just finished; saved with the summary
  // so the chat shows them again. Nothing for any other answer, or when the model can't say.
  public async suggestQuestions(threadId: string): Promise<string[]> {
    const thread = await loadThread(threadId);
    const answer = thread[thread.length - 1];
    const request = thread[thread.length - 2];
    if (answer?.role !== 'ai' || !answer.done || answer.onInterrupt || !answer.content.trim()) return [];
    if (request?.role !== 'human' || request.actionType !== 'askForSummary') return [];
    if (answer.suggestions) return answer.suggestions;
    try {
      const modelPreset = getChatModelPreset();
      const local = isLocalModel(modelPreset.modelName);
      const llm = getModelInstance({
        temperature: 0.3,
        maxTokens: 400,
        streaming: local,
        fast: true,
        modelPreset,
        jsonSchema: FOLLOW_UP_QUESTIONS_JSON_SCHEMA,
      });
      const prompt = [
        new HumanMessage(
          getFollowUpQuestionsPrompt(
            getCurrentLanguage(),
            request.summaryTitle ?? '',
            answer.content.slice(0, 8000)
          )
        ),
      ];
      // A slow local model's single response can outlast the service worker's fetch limit.
      let response: AIMessage | AIMessageChunk | undefined;
      if (local) {
        for await (const chunk of await llm.stream(prompt)) {
          response = response ? (response as AIMessageChunk).concat(chunk) : chunk;
        }
      } else {
        response = await llm.invoke(prompt);
      }
      if (!response) return [];
      await trackTokenUsage(modelPreset, response);
      const suggestions = parseQuestions(response.text);
      await db.messages.update(answer.id, { suggestions });
      return suggestions;
    } catch (err) {
      errorLog('ChatModelHandler [suggestQuestions] failed:', err);
      return [];
    }
  }

  public async retryStreamChat(
    threadId: string,
    messageIdxToRetry: number,
    port: chrome.runtime.Port,
    abortController: AbortController,
    actionType: ActionType,
    agentLabels?: AgentLabels
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
        reasoning: undefined,
        thinkingMs: undefined,
        suggestions: undefined,
        contextUsage: undefined,
        contextCompacted: undefined,
        agentRun: undefined,
        browserControlHint: undefined,
      });

      const historyForModelInput = fullThreadHistory.slice(0, messageIdxToRetry);
      const task = agentTask(historyForModelInput);
      if (task) {
        await this.runAgentAnswer(messageIdToRetry, historyForModelInput, task, port, abortController, agentLabels);
        return;
      }

      const customInstructions = (await readStorage<UserMemory>(STORAGE_USER_MEMORY))?.text;

      const currentLang = getCurrentLanguage();
      const initialSystemMessage = getInitialSystemMessage(
        currentLang,
        customInstructions,
        await rememberedFacts()
      );
      const initialAIMessage = getInitialAIMessage(currentLang);

      const messagesForModel = await this.compactedMessages(
        threadId,
        messageIdToRetry,
        historyForModelInput,
        initialSystemMessage,
        initialAIMessage,
        port
      );

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
