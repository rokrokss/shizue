import { currentThreadIdAtom, initialMessagesForAllThreadsAtom } from '@/hooks/chat';
import { deleteThread } from '@/lib/indexDB';
import { getTimeString } from '@/lib/time';
import { debugLog } from '@/logs';
import { DeleteOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ThreadListModal = ({ onClose }: { onClose: () => void }) => {
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [threadId, setThreadId] = useAtom(currentThreadIdAtom);
  const threadsWithMessages = useAtomValue(initialMessagesForAllThreadsAtom);

  const { t } = useTranslation();

  const handleDeleteThread = (id: string) => {
    if (id === threadId) {
      setThreadId(undefined);
      deleteThread(id);
      onClose();
      return;
    }
    deleteThread(id);
  };

  const handleClickThread = (id: string) => {
    setThreadId(id);
    onClose();
  };

  return (
    <>
      <div className="sz:text-lg sz:font-semibold sz:mb-4 sz:text-center">{t('chat.history')}</div>
      <div className="sz:flex sz:flex-col sz:gap-3">
        {threadsWithMessages.length > 0 ? (
          threadsWithMessages.map((thread) => {
            const isSelected = thread.threadId === threadId;
            const isHovered = hoveredThreadId === thread.threadId;
            debugLog(thread.threadId, threadId);
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
                    backgroundColor: isSelected || isHovered ? '#e0f0f0' : 'transparent',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    height: '55px',
                  }}
                >
                  <div className="sz:flex sz:flex-col sz:justify-between sz:w-full sz:font-ycom sz:pt-2 sz:pb-2">
                    <div
                      className="sz:max-w-full sz:flex sz:flex-row sz:min-w-full sz:justify-between sz:gap-2"
                      style={{
                        color: isSelected ? '#000' : '#777',
                      }}
                    >
                      <div className="sz:text-sm sz:overflow-hidden sz:text-ellipsis sz:whitespace-nowrap">
                        {thread.firstMessage?.content}
                      </div>
                      <div className="sz:text-xs sz:text-gray-500">
                        {getTimeString(thread.updatedAt, t)}
                      </div>
                    </div>
                    <div
                      className="sz:max-w-full sz:flex sz:flex-row sz:min-w-full sz:justify-between sz:gap-2"
                      style={{
                        color: isSelected ? '#000' : '#777',
                      }}
                    >
                      <div className="sz:text-sm sz:overflow-hidden sz:text-ellipsis sz:whitespace-nowrap sz:pt-[3px]">
                        {'> ' + thread.secondMessage?.content}
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
        ) : (
          <div className="sz:text-center sz:text-gray-500 sz:text-base">{t('chat.empty')}</div>
        )}
      </div>
    </>
  );
};

export default ThreadListModal;
