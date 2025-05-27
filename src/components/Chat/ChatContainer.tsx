import { Message } from '@/components/Chat';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatContainer = ({ messages }: { messages: Message[] }) => {
  return (
    <div
      className="
        sz:px-4 
        sz:pt-15 
        sz:w-full 
        sz:pb-8
      "
    >
      <div
        className="
          sz:flex 
          sz:flex-col 
          sz:gap-3 
          sz:text-sm 
          sz:font-ddin 
          sz:overflow-wrap-word
        "
      >
        {messages.map((m, idx) =>
          m.role === 'ai' ? (
            <div
              key={idx}
              className="
                sz-message 
                sz-mesage-ai 
                sz:w-full 
                sz:text-left 
                sz:text-black
              "
            >
              <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
            </div>
          ) : (
            <div
              key={idx}
              className="
                sz-message 
                sz-message-human 
                sz:w-fit 
                sz:text-right 
                sz:text-gray-600 
                sz:max-w-[70%] 
                sz:ml-auto 
                sz:bg-gray-100 
                sz:rounded-lg 
                sz:px-2
              "
            >
              <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ChatContainer;
