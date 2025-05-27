import CharacterPick from '@/components/Character/CharacterPick';
import { Message } from '@/components/Chat';
import { hashStringToIndex } from '@/utils/hash';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatContainer = ({ messages }: { messages: Message[] }) => {
  const characterIndexes: number[] = [];
  const characterCount = 6;

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
        {messages.map((m, idx) => {
          if (m.role === 'ai') {
            return (
              <div
                key={idx}
                className="sz-message sz-mesage-ai sz:w-full sz:text-left sz:text-black"
              >
                <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
              </div>
            );
          }

          const prev = characterIndexes[characterIndexes.length - 1] ?? null;
          const charIndex = hashStringToIndex(m.content + idx.toString(), prev, characterCount);
          characterIndexes.push(charIndex);

          return (
            <div className="sz:flex sz:flex-row sz:items-center sz:justify-center">
              <CharacterPick index={charIndex} marginLeft="0.25rem" />
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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChatContainer;
