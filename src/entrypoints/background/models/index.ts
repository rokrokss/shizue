type ChatModel = 'gpt-4o' | 'chatgpt-4o-mini';

let currentChatModel: ChatModel = 'gpt-4o';

const getCurrentChatModel = () => {
  return currentChatModel;
};
