import { ActionType } from '@/hooks/global';
import Dexie, { Table } from 'dexie';

export interface Message {
  id: string;
  threadId: string;
  role: 'human' | 'system' | 'ai';
  actionType: ActionType;
  summaryTitle?: string;
  summaryPageLink?: string;
  content: string;
  createdAt: number;
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
}

export interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface TokenUsage {
  id: string;
  date: string; // YYYY-MM-DD 형식
  model: string;
  provider: 'openai' | 'gemini';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  createdAt: number;
}

class DB extends Dexie {
  messages!: Table<Message, string>;
  threads!: Table<ThreadMeta, string>;
  tokenUsage!: Table<TokenUsage, string>;

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

// 토큰 사용량 관련 함수들
export const recordTokenUsage = async (usage: Omit<TokenUsage, 'id'>) => {
  const id = crypto.randomUUID();
  await db.tokenUsage.add({ ...usage, id });
};

export const getTokenUsageByDateRange = async (startDate: string, endDate: string): Promise<TokenUsage[]> => {
  return db.tokenUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .sortBy('createdAt');
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
