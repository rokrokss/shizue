import Dexie, { Table } from 'dexie';

export interface Message {
  id: string;
  threadId: string;
  role: 'human' | 'system' | 'ai';
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

class DB extends Dexie {
  messages!: Table<Message, string>;
  threads!: Table<ThreadMeta, string>;

  constructor() {
    super('ShizueDB');
    this.version(1).stores({
      // 'pk, ...indexes'
      messages: 'id, threadId, createdAt',
      threads: 'id, updatedAt',
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
