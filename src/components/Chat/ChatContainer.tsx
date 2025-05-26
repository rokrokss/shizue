import { Message } from '@/components/Chat';

const ChatContainer = ({
  threadId,
  messages,
}: {
  threadId: string | undefined;
  messages: Message[];
}) => {
  return (
    <div>
      <div>{threadId}</div>
      <div className="flex flex-col gap-2">
        {messages.map((m, idx) => (
          <div key={idx}>{m.content}</div>
        ))}
      </div>
    </div>
  );
};

export default ChatContainer;
