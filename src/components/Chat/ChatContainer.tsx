import { Message } from '@/components/Chat';

const ChatContainer = ({ messages }: { messages: Message[] }) => {
  return (
    <div className="sz:text-base sz:px-5 sz:pt-20 sz:w-full">
      <div className="sz:flex sz:flex-col sz:gap-3">
        {messages.map((m, idx) =>
          m.role === 'ai' ? (
            <div key={idx} className="sz:w-full sz:text-left sz:text-base">
              {m.content}
            </div>
          ) : (
            <div key={idx} className="sz:w-full sz:text-right sz:text-base sz:text-gray-500">
              {m.content}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ChatContainer;
