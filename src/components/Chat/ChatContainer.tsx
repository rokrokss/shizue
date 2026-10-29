import CharacterPickChat, { characterCount } from '@/components/Character/CharacterPickChat';
import { Message } from '@/components/Chat';
import { DotCycle } from '@/components/Loader/DotCycle';
import { isSelectionActionType } from '@/config/constants';
import { useThemeValue } from '@/hooks/layout';
import { useChatModel } from '@/hooks/models';
import useStreamText from '@/hooks/useStreamText';
import { hashStringToIndex } from '@/lib/hash';
import { modelSupportsWebSearch } from '@/lib/modelRegistry';
import { hasPageLines } from '@/lib/pageLines';
import {
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlaySquareOutlined,
  SnippetsOutlined,
  YoutubeOutlined,
} from '@ant-design/icons';
import MarkdownMessage from '@/components/Chat/MarkdownMessage';
import { videoKey, youtubeVideoId } from '@/lib/videoTranscript';
import { Button } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// What an answer's [12:34] times and [¶12] line numbers point into (components/Chat/MarkdownMessage).
type AnswerContext = {
  video?: string | null;
  storyboard?: string;
  page?: { url: string; prompt: string } | null;
};

const ChatContainer = ({
  messages,
  onRetry,
  onDetailedAnalysis,
  scrollToBottom,
}: {
  messages: Message[];
  onRetry: (messageIdxToRetry: number) => Promise<void>;
  onDetailedAnalysis: (answerIdx: number, research: boolean) => Promise<void>;
  scrollToBottom: () => void;
}) => {
  const { t } = useTranslation();
  const characterIndexes: number[] = [];
  const theme = useThemeValue();
  const [chatModel] = useChatModel();
  const researchSupported = modelSupportsWebSearch(chatModel);
  // The answer whose detailed analysis was just asked for, so its button goes at once.
  const [detailedAskedFor, setDetailedAskedFor] = useState<number | null>(null);

  const animatedText = useStreamText(messages[messages.length - 1].content.trim(), {
    handleOnComplete: scrollToBottom,
  });

  const showRetryButton = (message: Message) =>
    (message.onInterrupt && !message.stopped) || message.stopped;

  const getMarkdownText = (content: string, streaming = false, context: AnswerContext = {}) => {
    return <MarkdownMessage content={content} streaming={streaming} {...context} />;
  };

  // Whether a video's captions went with the question.
  const captionsNote = (captions?: boolean) => (
    <span> · {captions ? t('chat.withCaptions') : t('chat.withoutCaptions')}</span>
  );

  // The summary prompt of `url` with numbered lines, at or before `from`: a detailed summary's own
  // prompt has none and refers to the earlier one.
  const numberedPrompt = (from: number, url: string) => {
    for (let i = from; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'human' && m.actionType === 'askForSummary' && m.summaryPageLink === url) {
        if (hasPageLines(m.content)) return m.content;
      }
    }
    return null;
  };

  // What an answer's references point into: the video whose captions the conversation last
  // attached or summarized (unless that was more than one), with its storyboard when summarized,
  // or the page it last summarized, for its [¶12] line numbers.
  const answerContext = (idx: number): AnswerContext => {
    for (let i = idx - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'human') continue;
      if (m.actionType === 'askForSummary') {
        if (m.summaryCaptions) {
          return { video: videoKey(m.summaryPageLink), storyboard: m.summaryStoryboard };
        }
        const prompt = m.summaryPageLink ? numberedPrompt(i, m.summaryPageLink) : null;
        return prompt ? { page: { url: m.summaryPageLink!, prompt } } : {};
      }
      const videos = (m.attachments ?? []).filter((page) => page.captions);
      if (videos.length) return { video: videos.length === 1 ? videoKey(videos[0].url) : null };
    }
    return {};
  };

  // A summary that is the chat's last answer offers its detailed analysis.
  const offersDetailedAnalysis = (idx: number) =>
    idx === messages.length - 1 &&
    idx !== detailedAskedFor &&
    messages[idx].done &&
    !messages[idx].onInterrupt &&
    messages[idx - 1]?.role === 'human' &&
    messages[idx - 1].actionType === 'askForSummary' &&
    messages[idx - 1].summaryMode !== 'detailed';

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
            const isDummyMessage =
              (idx < messages.length - 1 &&
                messages[idx + 1].role === 'ai' &&
                m.content.trim() === '') ||
              (idx > 0 && messages[idx - 1].role === 'ai' && m.content.trim() === '');
            const isRetryButtonVisible = showRetryButton(m);
            return (
              !isDummyMessage && (
                <div
                  key={idx}
                  className="sz-message sz-message-ai sz:w-full sz:text-left sz:flex sz:flex-col"
                  style={{
                    color: theme == 'dark' ? 'white' : 'black',
                  }}
                >
                  {/* index: {idx} <br /> */}
                  <div
                    className="sz:flex sz:flex-col sz:text-left sz:w-full"
                    style={{
                      minHeight: isRetryButtonVisible ? 'auto' : '30px',
                    }}
                  >
                    {m.onInterrupt && !m.stopped ? (
                      <>
                        {t('chat.connectionError')}
                        {m.errorMessage ? (
                          <div className="sz:text-xs sz:text-gray-500 sz:pt-1 sz:break-words">
                            {m.errorMessage}
                          </div>
                        ) : null}
                      </>
                    ) : idx === messages.length - 1 && !m.done ? (
                      m.content.trim() ? (
                        getMarkdownText(animatedText, true, answerContext(idx))
                      ) : isRetryButtonVisible ? null : (
                        <div className="sz:flex sz:flex-row sz:items-center sz:justify-start sz:pl-3 sz:text-xl">
                          <DotCycle />
                        </div>
                      )
                    ) : (
                      getMarkdownText(m.content, false, answerContext(idx))
                    )}
                  </div>
                  {m.sources?.length ? (
                    <div className="sz-message-sources sz:flex sz:flex-col sz:gap-0.5 sz:pt-2 sz:text-xs sz:text-gray-500">
                      <div>{t('chat.sources')}</div>
                      {m.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={source.url}
                          className="sz:flex sz:flex-row sz:items-center sz:gap-1 sz:min-w-0 sz:text-gray-500"
                        >
                          <LinkOutlined className="sz:shrink-0" />
                          <span className="sz:truncate">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {/* <div className="sz:text-xs sz:text-gray-500 sz:pl-0.5 sz:pt-1">
                    onInterrupt: {m.onInterrupt ? 'true' : 'false'} <br />
                    stopped: {m.stopped ? 'true' : 'false'} <br />
                    done: {m.done ? 'true' : 'false'} <br />
                    role: {m.role} <br />
                    actionType: {m.actionType}
                  </div> */}
                  {m.contextTruncated ? (
                    <div className="sz:flex sz:flex-row sz:items-start sz:gap-1 sz:text-xs sz:text-gray-500 sz:pt-1">
                      <InfoCircleOutlined className="sz:pt-[2px]" />
                      <span>{t('chat.contextTruncated')}</span>
                    </div>
                  ) : null}
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
                  {offersDetailedAnalysis(idx) ? (
                    <div className="sz:pt-2">
                      <Button
                        color="cyan"
                        variant="outlined"
                        size="small"
                        icon={researchSupported ? <GlobalOutlined /> : <FileTextOutlined />}
                        onClick={() => {
                          setDetailedAskedFor(idx);
                          void onDetailedAnalysis(idx, researchSupported);
                        }}
                      >
                        {researchSupported
                          ? t('chat.detailedAnalysisWithWebSearch')
                          : t('chat.detailedAnalysis')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
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
              <CharacterPickChat
                index={charIndex}
                scale={1}
                marginLeft="0.25rem"
                dark={theme == 'dark'}
              />
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
                sz:pt-[9px]
                sz:pb-[8px]
              "
              >
                {m.images && m.images.length > 0 && (
                  <div className="sz:flex sz:flex-wrap sz:gap-2 sz:mb-[8px] sz:mt-[7px]">
                    {m.images.map((imageBase64, imgIdx) => (
                      <img
                        src={imageBase64}
                        key={`${idx}-image-${imgIdx}`}
                        alt={`Image ${imgIdx + 1}`}
                        className="sz:max-w-[200px] sz:max-h-[200px] sz:object-contain sz:rounded sz:border-gray-300 sz:border sz:cursor-pointer"
                        style={{
                          filter: theme === 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
                        }}
                      />
                    ))}
                  </div>
                )}
                {(m.actionType === 'chat' ||
                  m.actionType === 'extractImageText' ||
                  m.actionType === 'describeImage') &&
                !m.translateMode ? (
                  <div className="sz:flex sz:flex-col sz:whitespace-pre-wrap sz:break-keep sz:text-left">
                    {m.content}
                    {m.webSearch ? (
                      <div className="sz:flex sz:flex-row sz:items-center sz:gap-1 sz:pt-1">
                        <GlobalOutlined />
                        <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">{t('chat.webSearch')}</div>
                      </div>
                    ) : null}
                    {m.attachments?.map((page, pageIdx) => {
                      const row = (
                        <div className="sz:flex sz:flex-row sz:items-center sz:gap-1">
                          {page.video ? (
                            youtubeVideoId(page.url) ? <YoutubeOutlined /> : <PlaySquareOutlined />
                          ) : page.pdf ? (
                            <FilePdfOutlined />
                          ) : page.file ? (
                            <FileOutlined />
                          ) : page.pasted ? (
                            <SnippetsOutlined />
                          ) : (
                            <LinkOutlined />
                          )}
                          <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">
                            {(page.title || page.url).length > 25
                              ? (page.title || page.url).slice(0, 25) + '...'
                              : page.title || page.url}
                            {page.video ? captionsNote(page.captions) : null}
                          </div>
                        </div>
                      );
                      // A file from the computer and pasted text have no address to open.
                      return page.url ? (
                        <a
                          key={`${idx}-page-${pageIdx}`}
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sz:pt-1"
                        >
                          {row}
                        </a>
                      ) : (
                        <div key={`${idx}-page-${pageIdx}`} className="sz:pt-1">
                          {row}
                        </div>
                      );
                    })}
                    {m.attachments?.some((page) => page.truncated) ? (
                      <div className="sz:flex sz:flex-row sz:items-start sz:gap-1 sz:text-xs sz:text-gray-500 sz:pt-1">
                        <InfoCircleOutlined className="sz:pt-[2px]" />
                        <span>
                          {m.attachments.every((page) => !page.truncated || page.captions)
                            ? t('chat.attachmentTruncatedVideo')
                            : t('chat.attachmentTruncated')}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : m.actionType === 'askForSummary' ? (
                  <div className="sz:flex sz:flex-col">
                    {getMarkdownText(
                      m.summaryMode === 'detailed'
                        ? t('chat.detailedAnalysisRequestText')
                        : m.summaryVideo
                          ? t('chat.summaryVideoRequestText')
                          : t('chat.summaryRequestText')
                    )}
                    {m.webSearch ? (
                      <div className="sz:flex sz:flex-row sz:items-center sz:gap-1">
                        <GlobalOutlined />
                        <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">{t('chat.webSearch')}</div>
                      </div>
                    ) : null}
                    <a href={m.summaryPageLink} target="_blank" rel="noopener noreferrer">
                      <div className="sz:flex sz:flex-row sz:items-center sz:gap-1">
                        {m.summaryVideo ? <YoutubeOutlined /> : <LinkOutlined />}
                        <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">
                          {m.summaryTitle && m.summaryTitle.length > 25
                            ? m.summaryTitle?.slice(0, 25) + '...'
                            : m.summaryTitle}
                          {m.summaryVideo ? captionsNote(m.summaryCaptions) : null}
                        </div>
                      </div>
                    </a>
                  </div>
                ) : isSelectionActionType(m.actionType) ? (
                  <div className="sz:flex sz:flex-col sz:text-left">
                    {getMarkdownText(t(`chat.${m.actionType}Request`))}
                    <div className="sz:mb-[6px] sz:pl-[8px] sz:border-l-[3px] sz:border-[#32CCBC] sz:text-gray-500 sz:whitespace-pre-wrap sz:break-keep sz:line-clamp-6">
                      {m.selectionText}
                    </div>
                    <a href={m.summaryPageLink} target="_blank" rel="noopener noreferrer">
                      <div className="sz:flex sz:flex-row sz:items-center sz:gap-1">
                        <LinkOutlined />
                        <div className="sz:text-sm sz:text-gray-500 sz:pb-[2px]">
                          {m.summaryTitle && m.summaryTitle.length > 25
                            ? m.summaryTitle.slice(0, 25) + '...'
                            : m.summaryTitle}
                        </div>
                      </div>
                    </a>
                  </div>
                ) : m.translateMode ? (
                  <div className="sz:flex sz:flex-col">
                    {getMarkdownText(t('chat.activateTranslateMode'))}
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
