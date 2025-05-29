type ChatModel = 'gpt-4.1' | 'gpt-4.1-mini';

let currentChatModel: ChatModel = 'gpt-4.1';

const getCurrentChatModel = () => {
  return currentChatModel;
};
