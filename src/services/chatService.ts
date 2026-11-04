import { MESSAGE_CANCEL_NOT_STARTED_MESSAGE, MESSAGE_SUGGEST_QUESTIONS } from '@/config/constants';

async function cancelNotStartedMessage(threadId: string) {
  void chrome.runtime.sendMessage({
    action: MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
    threadId,
  });
}

// Questions to ask next under the summary that just finished in this thread; [] for none.
async function suggestQuestions(threadId: string): Promise<string[]> {
  const result = await chrome.runtime.sendMessage({ action: MESSAGE_SUGGEST_QUESTIONS, threadId });
  return Array.isArray(result) ? result : [];
}

export const chatService = {
  cancelNotStartedMessage,
  suggestQuestions,
};
