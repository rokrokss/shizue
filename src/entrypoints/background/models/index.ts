type ChatModel = 'chatgpt-4o-latest' | 'chatgpt-4o-mini';

let currentChatModel: ChatModel = 'chatgpt-4o-latest';

const getCurrentChatModel = () => {
  return currentChatModel;
};
