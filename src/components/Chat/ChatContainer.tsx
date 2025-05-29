import CharacterPickChat, { characterCount } from '@/components/Character/CharacterPickChat';
import { Message } from '@/components/Chat';
import useStreamText from '@/hooks/useStreamText';
import { hashStringToIndex } from '@/lib/hash';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatContainer = ({
  messages,
  scrollToBottom,
}: {
  messages: Message[];
  scrollToBottom: () => void;
}) => {
  const { t } = useTranslation();
  const characterIndexes: number[] = [];

  const animatedText = useStreamText(messages[messages.length - 1].content, {
    handleOnComplete: scrollToBottom,
  });

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
                className="sz-message sz-mesage-ai sz:w-full sz:text-left sz:text-black sz:flex sz:flex-col"
              >
                <div className="sz:flex sz:flex-col sz:text-left sz:w-full">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {m.onInterrupt && !m.stopped
                      ? t('chat.connectionError')
                      : idx === messages.length - 1 && !m.done
                      ? animatedText
                      : m.content}
                  </Markdown>
                </div>

                {(m.onInterrupt && !m.stopped) || m.stopped ? (
                  <div className="sz:text-xs sz:text-gray-500 sz:pl-0.5 sz:pt-1">
                    <Button
                      color="cyan"
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        console.log('retry');
                      }}
                    >
                      {t('chat.retry')}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          }

          const prev = characterIndexes[characterIndexes.length - 1] ?? null;
          const charIndex = hashStringToIndex(m.content + idx.toString(), prev, characterCount);
          characterIndexes.push(charIndex);

          return (
            <div
              key={`${idx}-container`}
              className="sz:flex sz:flex-row sz:items-center sz:justify-center"
            >
              <CharacterPickChat index={charIndex} scale={1} marginLeft="0.25rem" />
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
                sz:px-3
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
