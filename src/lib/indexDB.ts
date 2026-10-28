import { isSelectionActionType } from '@/config/constants';
import { ActionType } from '@/hooks/global';
import type { WebSource } from '@/lib/webSources';
import Dexie, { Table } from 'dexie';

// A tab, file or pasted text attached to a chat message: its text when the message was sent.
export interface PageAttachment {
  title: string;
  // Empty for a file from the computer and for pasted text.
  url: string;
  text: string;
  pdf?: boolean;
  // A text or code file from the computer.
  file?: boolean;
  // Long text pasted into the chat box.
  pasted?: boolean;
  // A YouTube video, and its text is its captions (else the page's text).
  video?: boolean;
  captions?: boolean;
  // The text was cut to fit the size limit for one message.
  truncated?: boolean;
}

export interface Message {
  id: string;
  threadId: string;
  role: 'human' | 'system' | 'ai';
  actionType: ActionType;
  summaryTitle?: string;
  summaryPageLink?: string;
  // A summary of a YouTube video, made from its captions when summaryCaptions.
  summaryVideo?: boolean;
  summaryCaptions?: boolean;
  selectionText?: string;
  translateMode?: boolean;
  content: string;
  images?: string[];
  attachments?: PageAttachment[];
  // The question asked for a web search with its answer.
  webSearch?: boolean;
  // The pages a web search answer drew on.
  sources?: WebSource[];
  createdAt: number;
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
  errorMessage?: string;
  // A long message was cut to fit the local model's context before this reply.
  contextTruncated?: boolean;
}

export interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: number;
  // Auto memory has read the questions up to this message's createdAt.
  memoryReadAt?: number;
}

export interface TokenUsage {
  id: string;
  date: string; // YYYY-MM-DD
  model: string;
  provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'local' | 'chatgpt';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  createdAt: number;
}

export interface Memo {
  id: string;
  title: string;
  content: string;
  folder?: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

// A word looked up in a video's captions and saved to the word list (lib/wordLookup.ts).
export interface SavedWord {
  id: string;
  // As it appeared in the caption.
  word: string;
  lemma: string;
  reading: string;
  partOfSpeech: string;
  meaning: string;
  note: string;
  sentence: string;
  sentenceTranslation: string;
  sourceTitle: string;
  // The video, from where the line was spoken when the site's links can say so.
  sourceUrl: string;
  createdAt: number;
}

class DB extends Dexie {
  messages!: Table<Message, string>;
  threads!: Table<ThreadMeta, string>;
  tokenUsage!: Table<TokenUsage, string>;
  memos!: Table<Memo, string>;
  words!: Table<SavedWord, string>;

  constructor() {
    super('ShizueDB');
    this.version(1).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
    });
    this.version(2).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
    });
    this.version(3).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
    });
    this.version(4).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
    });
    this.version(5).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
      memos: 'id, folder, isPinned, createdAt, updatedAt',
    });
    this.version(6).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
      tokenUsage: 'id, date, model, provider, createdAt',
      memos: 'id, folder, isPinned, createdAt, updatedAt',
      words: 'id, createdAt',
    });
  }
}

export interface ThreadWithInitialMessages {
  threadId: string;
  title: string;
  updatedAt: number;
  firstMessage?: Message;
  secondMessage?: Message;
}

export const db = new DB();

export const addMessage = (m: Message) => db.messages.add(m);
export const loadThread = (id: string) =>
  db.messages.where('threadId').equals(id).sortBy('createdAt');
export const listThreads = () => db.threads.orderBy('updatedAt').reverse().toArray();
export const touchThread = async (id: string) => {
  await db.threads.update(id, { updatedAt: Date.now() });
};
export const createThread = async (title = 'NEW_CHAT') => {
  const id = crypto.randomUUID();
  await db.threads.add({ id, title, updatedAt: Date.now() });
  return id;
};
export const deleteThread = async (id: string) => {
  await db.messages.where('threadId').equals(id).delete();
  await db.threads.delete(id);
};
export const getLatestMessageForThread = async (threadId: string) => {
  const messageList = await db.messages.where('threadId').equals(threadId).sortBy('createdAt');
  return messageList.pop();
};
export const getInitialMessagesForAllThreads = async (): Promise<ThreadWithInitialMessages[]> => {
  const allThreads = await listThreads();
  const result: ThreadWithInitialMessages[] = [];

  for (const threadMeta of allThreads) {
    const sortedMessages = await db.messages
      .where('threadId')
      .equals(threadMeta.id)
      .sortBy('createdAt');

    const messagesInThread = sortedMessages.slice(0, 2);

    result.push({
      threadId: threadMeta.id,
      title: threadMeta.title,
      updatedAt: threadMeta.updatedAt,
      firstMessage: messagesInThread[0],
      secondMessage: messagesInThread[1],
    });
  }

  return result;
};

// The text a message shows in the chat: a summary request shows its page's title and a selection
// action the selected text, not the page text sent with them. The translate mode prompt is fixed.
const shownText = (m: Message) =>
  m.role !== 'human'
    ? m.content
    : m.translateMode
    ? ''
    : m.actionType === 'askForSummary'
    ? m.summaryTitle ?? ''
    : isSelectionActionType(m.actionType)
    ? m.selectionText ?? ''
    : m.content;

export interface ThreadSearchHit {
  // The first matching message's shown text, and where the match starts in it.
  text: string;
  index: number;
}

// Threads with a message whose shown text contains `query`, ignoring case.
export const searchThreads = async (query: string) => {
  const needle = query.toLowerCase();
  const hits = new Map<string, ThreadSearchHit & { createdAt: number }>();
  await db.messages.each((m) => {
    const text = shownText(m);
    const index = text.toLowerCase().indexOf(needle);
    const hit = hits.get(m.threadId);
    if (index >= 0 && (!hit || m.createdAt < hit.createdAt)) {
      hits.set(m.threadId, { text, index, createdAt: m.createdAt });
    }
  });
  return hits as Map<string, ThreadSearchHit>;
};

// Token usage related functions
export const recordTokenUsage = async (usage: Omit<TokenUsage, 'id'>) => {
  const id = crypto.randomUUID();
  await db.tokenUsage.add({ ...usage, id });
};

export const getTokenUsageByDateRange = async (
  startDate: string,
  endDate: string
): Promise<TokenUsage[]> => {
  return db.tokenUsage.where('date').between(startDate, endDate, true, true).sortBy('createdAt');
};

export const getTokenUsageByDate = async (date: string): Promise<TokenUsage[]> => {
  return db.tokenUsage.where('date').equals(date).toArray();
};

export const getTotalTokenUsage = async (): Promise<{
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalRequests: number;
}> => {
  const allUsage = await db.tokenUsage.toArray();
  return allUsage.reduce(
    (acc, usage) => ({
      totalInputTokens: acc.totalInputTokens + usage.inputTokens,
      totalOutputTokens: acc.totalOutputTokens + usage.outputTokens,
      totalTokens: acc.totalTokens + usage.totalTokens,
      totalRequests: acc.totalRequests + usage.requestCount,
    }),
    { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, totalRequests: 0 }
  );
};

// Memo related functions
export const addMemo = (memo: Memo) => db.memos.add(memo);

export const updateMemo = async (id: string, updates: Partial<Memo>) => {
  await db.memos.update(id, { ...updates, updatedAt: Date.now() });
};

export const deleteMemo = async (id: string) => {
  await db.memos.delete(id);
};

export const getMemo = (id: string) => db.memos.get(id);

export const listMemos = async (folder?: string) => {
  let query = db.memos.orderBy('updatedAt').reverse();

  if (folder) {
    const memos = await query.toArray();
    return memos.filter((memo) => memo.folder === folder);
  }

  return query.toArray();
};

export const searchMemos = async (searchTerm: string) => {
  const allMemos = await db.memos.toArray();
  const lowerSearchTerm = searchTerm.toLowerCase();

  return allMemos
    .filter(
      (memo) =>
        memo.title.toLowerCase().includes(lowerSearchTerm) ||
        memo.content.toLowerCase().includes(lowerSearchTerm)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const toggleMemoPinned = async (id: string) => {
  const memo = await db.memos.get(id);
  if (memo) {
    await db.memos.update(id, { isPinned: !memo.isPinned, updatedAt: Date.now() });
  }
};

export const createMemo = async (title: string, content: string = '', folder?: string) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.memos.add({
    id,
    title,
    content,
    folder,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
};

// Word list
export const addWord = (word: SavedWord) => db.words.add(word);

export const listWords = () => db.words.orderBy('createdAt').reverse().toArray();

export const deleteWord = (id: string) => db.words.delete(id);
