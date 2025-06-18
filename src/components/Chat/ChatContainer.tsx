import CharacterPickChat, { characterCount } from '@/components/Character/CharacterPickChat';
import { Message } from '@/components/Chat';
import { DotCycle } from '@/components/Loader/DotCycle';
import { useThemeValue } from '@/hooks/layout';
import useStreamText from '@/hooks/useStreamText';
import { hashStringToIndex } from '@/lib/hash';
import { LinkOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChatContainer = ({
  messages,
  onRetry,
  scrollToBottom,
}: {
  messages: Message[];
  onRetry: (messageIdxToRetry: number) => Promise<void>;
  scrollToBottom: () => void;
}) => {
  const { t } = useTranslation();
  const characterIndexes: number[] = [];
  const theme = useThemeValue();

  const animatedText = useStreamText(messages[messages.length - 1].content.trim(), {
    handleOnComplete: scrollToBottom,
  });

  const showRetryButton = (message: Message) =>
    (message.onInterrupt && !message.stopped) || message.stopped;

  const getMarkdownText = (content: string) => {
    return <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>;
  };

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
            const isRetryButtonVisible = showRetryButton(m);
            return (
              <div
                key={idx}
                className="sz-message sz-mesage-ai sz:w-full sz:text-left sz:flex sz:flex-col"
                style={{
                  color: theme == 'dark' ? 'white' : 'black',
                }}
              >
                <div
                  className="sz:flex sz:flex-col sz:text-left sz:w-full"
                  style={{
                    minHeight: isRetryButtonVisible ? 'auto' : '30px',
                  }}
                >
                  {m.onInterrupt && !m.stopped ? (
                    t('chat.connectionError')
                  ) : idx === messages.length - 1 && !m.done ? (
                    m.content.trim() ? (
                      getMarkdownText(animatedText)
                    ) : isRetryButtonVisible ? null : (
                      <div className="sz:flex sz:flex-row sz:items-center sz:justify-start sz:pl-3 sz:text-xl">
                        <DotCycle />
                      </div>
                    )
                  ) : (
                    getMarkdownText(m.content)
                  )}
                </div>

                {isRetryButtonVisible ? (
                  <div className="sz:text-xs sz:text-gray-500 sz:pl-0.5 sz:pt-1">
                    <Button
                      color="cyan"
                      variant="outlined"
                      size="small"
                      onClick={() => onRetry(idx)}
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
              className="sz:flex sz:flex-row sz:items-start sz:justify-center"
              style={{
                filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
              }}
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
                sz:px-[14px]
                sz:py-[8px]
              "
              >
                {m.actionType === 'chat' ? (
                  <div className="sz:flex sz:flex-col sz:whitespace-pre-wrap">{m.content}</div>
                ) : m.actionType === 'askForSummary' ? (
                  <div className="sz:flex sz:flex-col">
                    {getMarkdownText(t('chat.summaryRequestText'))}
                    <a href={m.summaryPageLink} target="_blank" rel="noopener noreferrer">
                      <div className="sz:flex sz:flex-row sz:items-center sz:gap-1">
                        <LinkOutlined />
                        <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">
                          {m.summaryTitle && m.summaryTitle.length > 25
                            ? m.summaryTitle?.slice(0, 25) + '...'
                            : m.summaryTitle}
                        </div>
                      </div>
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChatContainer;
