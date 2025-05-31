import { MESSAGE_CANCEL_NOT_STARTED_MESSAGE } from '@/config/constants';

async function cancelNotStartedMessage(threadId: string) {
  void chrome.runtime.sendMessage({
    action: MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
    threadId,
  });
}

export const chatService = {
  cancelNotStartedMessage,
};
