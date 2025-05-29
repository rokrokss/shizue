import { MESSAGE_CANCEL_NOT_STARTED_MESSAGE, MESSAGE_LOAD_THREAD } from '@/config/constants';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';

async function handleLoadThread(msg: any, sendResponse: (response?: any) => void) {
  const data = await loadThread(msg.threadId);
  sendResponse(
    data
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
        done: m.done,
        onInterrupt: m.onInterrupt,
        stopped: m.stopped,
      }))
  );
}

async function handleLatestMessageForThread(msg: any, sendResponse: (response?: any) => void) {
  const latestMessage = await getLatestMessageForThread(msg.threadId);
  if (
    latestMessage &&
    !latestMessage.done &&
    !latestMessage.onInterrupt &&
    !latestMessage.stopped &&
    latestMessage.role === 'ai'
  ) {
    await db.messages.update(latestMessage.id, { stopped: true });
  }
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
};
