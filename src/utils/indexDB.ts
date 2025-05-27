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
