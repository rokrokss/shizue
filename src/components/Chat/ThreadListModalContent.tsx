import { isSelectionActionType } from '@/config/constants';
import { initialMessagesForAllThreadsAtom, switchThreadAtom } from '@/hooks/chat';
import { threadIdAtom } from '@/hooks/global';
import { getI8NLanguage, useLanguage } from '@/hooks/language';
import { useThemeValue } from '@/hooks/layout';
import {
  deleteThread,
  searchThreads,
  ThreadSearchHit,
  ThreadWithInitialMessages,
} from '@/lib/indexDB';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useAtomValue, useSetAtom } from 'jotai';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Import common locales
import 'dayjs/locale/ar';
import 'dayjs/locale/de';
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/pt';
import 'dayjs/locale/ru';
import 'dayjs/locale/zh';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

// A line of the matching message from a little before the match, with the match marked.
const SearchSnippet = ({
  hit,
  length,
  theme,
}: {
  hit: ThreadSearchHit;
  length: number;
  theme: string;
}) => {
  const start = Math.max(0, hit.index - 10);
  const line = (text: string) => text.replace(/\s+/g, ' ');
  return (
    <>
      {start > 0 ? '…' : ''}
      {line(hit.text.slice(start, hit.index))}
      <mark
        className={`sz:rounded-sm sz:px-0.5 ${
          theme == 'dark' ? 'sz:bg-sz-cyan/35 sz:text-white' : 'sz:bg-sz-cyan/30 sz:text-black'
        }`}
      >
        {line(hit.text.slice(hit.index, hit.index + length))}
      </mark>
      {line(hit.text.slice(hit.index + length))}
    </>
  );
};

const ThreadListModal = ({ onClose }: { onClose: () => void }) => {
  const theme = useThemeValue();
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const threadId = useAtomValue(threadIdAtom);
  const switchThread = useSetAtom(switchThreadAtom);
  const threadsWithMessages = useAtomValue(initialMessagesForAllThreadsAtom);
  const [query, setQuery] = useState('');
  // The threads matching the query, by id, once the search for it is done.
  const [hits, setHits] = useState<Map<string, ThreadSearchHit> | null>(null);
  const searched = query.trim();
  const shownThreads = hits
    ? threadsWithMessages?.filter((thread) => hits.has(thread.threadId))
    : threadsWithMessages;

  const { t } = useTranslation();
  const { lang } = useLanguage();

  // Update dayjs locale when language changes
  useEffect(() => {
    const i18nLang = getI8NLanguage(lang);
    // Map i18n language codes to dayjs locale codes
    const dayjsLocale = i18nLang.replace('_', '-').toLowerCase();
    try {
      dayjs.locale(dayjsLocale);
    } catch (e) {
      // Fallback to primary language code if full locale not available
      const primaryLang = dayjsLocale.split('-')[0];
      try {
        dayjs.locale(primaryLang);
      } catch (e2) {
        dayjs.locale('en');
      }
    }
  }, [lang]);

  // Searches every message once typing pauses; a later query's result replaces an earlier one's.
  useEffect(() => {
    if (!searched) {
      setHits(null);
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      const result = await searchThreads(searched);
      if (current) setHits(result);
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [searched, threadsWithMessages]);

  const handleDeleteThread = (id: string) => {
    if (id === threadId) {
      switchThread(undefined);
      deleteThread(id);
      onClose();
      return;
    }
    deleteThread(id);
  };

  const handleClickThread = (id: string) => {
    switchThread(id);
    onClose();
  };

  const getThreadTitle = (thread: ThreadWithInitialMessages) => {
    if (thread.firstMessage?.actionType === 'askForSummary') {
      const label = thread.firstMessage.summaryVideo
        ? t('overlayMenu.summarizeVideo')
        : t('overlayMenu.summarizePage');
      return label + ': ' + thread.firstMessage.summaryTitle;
    } else if (thread.firstMessage && isSelectionActionType(thread.firstMessage.actionType)) {
      return (
        t(`overlayMenu.${thread.firstMessage.actionType}`) + ': ' + thread.firstMessage.selectionText
      );
    } else if (thread.firstMessage?.translateMode) {
      return t('chat.activateTranslateMode');
    }
    return thread.firstMessage?.content;
  };

  return (
    <>
      <div
        className={`sz:text-lg sz:font-semibold sz:mb-4 sz:text-center ${
          theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
        }`}
      >
        {t('chat.history')}
      </div>
      <Input
        placeholder={t('chat.searchChats')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`sz:font-ycom sz:mb-4 ${theme === 'dark' ? 'dark-input' : ''}`}
        allowClear
      />
      <div className="sz:flex sz:flex-col sz:gap-3 sz:overflow-y-auto sz:scrollbar-hidden sz:max-h-[70vh]">
        {shownThreads && shownThreads.length > 0 ? (
          shownThreads.map((thread) => {
            const hit = hits?.get(thread.threadId);
            const isSelected = thread.threadId === threadId;
            const isHovered = hoveredThreadId === thread.threadId;
            return (
              <div
                key={thread.threadId}
                className="sz:flex sz:items-center"
                onMouseEnter={() => setHoveredThreadId(thread.threadId)}
                onMouseLeave={() => setHoveredThreadId(null)}
              >
                <Button
                  type="text"
                  className="sz:flex-1 sz:text-left sz:max-w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClickThread(thread.threadId);
                  }}
                  style={{
                    backgroundColor:
                      isSelected || isHovered
                        ? theme == 'dark'
                          ? '#141414'
                          : '#e0f0f0'
                        : 'transparent',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    height: '55px',
                  }}
                >
                  <div className="sz:flex sz:flex-col sz:justify-between sz:w-full sz:font-ycom sz:pt-2 sz:pb-2">
                    <div
                      className="sz:max-w-full sz:flex sz:flex-row sz:min-w-full sz:justify-between sz:gap-2"
                      style={{
                        color: isSelected ? (theme == 'dark' ? 'white' : 'black') : '#777',
                      }}
                    >
                      <div
                        className={`sz:text-sm sz:overflow-hidden sz:text-ellipsis sz:whitespace-nowrap ${
                          theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                        }`}
                      >
                        {getThreadTitle(thread)}
                      </div>
                      <div
                        className={`sz:text-xs ${
                          theme == 'dark' ? 'sz:text-[#ccc]' : 'sz:text-gray-500'
                        }`}
                      >
                        {dayjs(thread.updatedAt).fromNow()}
                      </div>
                    </div>
                    <div
                      className="sz:max-w-full sz:flex sz:flex-row sz:min-w-full sz:justify-between sz:gap-2"
                      style={{
                        color: isSelected
                          ? theme == 'dark'
                            ? 'white'
                            : 'black'
                          : theme == 'dark'
                          ? '#ccc'
                          : '#777',
                      }}
                    >
                      <div className="sz:text-sm sz:overflow-hidden sz:text-ellipsis sz:whitespace-nowrap sz:pt-[3px]">
                        {hit ? (
                          <SearchSnippet hit={hit} length={searched.length} theme={theme} />
                        ) : (
                          '> ' + thread.secondMessage?.content
                        )}
                      </div>
                      <div className="sz:text-xs sz:text-gray-500 sz:flex sz:flex-row sz:gap-1 sz:w-6">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteThread(thread.threadId);
                          }}
                          className="sz:text-gray-400 sz:hover:text-red-400 sz:cursor-pointer sz:w-6 sz:h-6 sz:flex sz:items-center sz:justify-center"
                          style={{
                            fontSize: '15px',
                            visibility: isHovered || isSelected ? 'visible' : 'hidden',
                          }}
                        >
                          <DeleteOutlined />
                        </div>
                      </div>
                    </div>
                  </div>
                </Button>
              </div>
            );
          })
        ) : shownThreads ? (
          <div className="sz:text-center sz:text-gray-500 sz:text-base">
            {hits ? t('memo.noSearchResults') : t('chat.empty')}
          </div>
        ) : null}
      </div>
    </>
  );
};

export default ThreadListModal;
