import { currentThreadIdAtom, threadsAtom } from '@/hooks/chat';
import { deleteThread } from '@/lib/indexDB';
import { Button } from 'antd';
import { useAtom, useAtomValue } from 'jotai';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ThreadListModal = ({ onClose }: { onClose: () => void }) => {
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);

  const { t } = useTranslation();
  const [threadId, setThreadId] = useAtom(currentThreadIdAtom);
  const threads = useAtomValue(threadsAtom);

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
      <div className="sz:flex sz:flex-col sz:gap-2">
        {threads.length > 0 ? (
          threads.map((thread) => {
            const isSelected = thread.id === threadId;
            const isHovered = hoveredThreadId === thread.id;
            const date = new Date(thread.updatedAt);
            return (
              <div
                key={thread.id}
                className="sz:flex sz:items-center sz:gap-1"
                onMouseEnter={() => setHoveredThreadId(thread.id)}
                onMouseLeave={() => setHoveredThreadId(null)}
              >
                <Button
                  type="text"
                  className="sz:flex-1 sz:text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClickThread(thread.id);
                  }}
                >
                  <div className="sz:flex sz:justify-between sz:w-full sz:font-ycom">
                    <div
                      className="sz:text-xs"
                      style={{
                        color: isSelected ? '#000' : '#777',
                      }}
                    >
                      {date.toLocaleDateString()}
                    </div>
                    <div
                      className="sz:text-sm"
                      style={{
                        color: isSelected ? '#000' : '#777',
                      }}
                    >
                      {thread.title.length > 7 ? `${thread.title.slice(0, 7)}..` : thread.title}
                    </div>
                  </div>
                </Button>
                <Button
                  shape="circle"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteThread(thread.id);
                  }}
                  className={`
                    sz:w-6 sz:h-6 sz:flex-shrink-0 sz:flex sz:items-center sz:justify-center
                    ${
                      isHovered
                        ? 'sz:visible sz:opacity-100'
                        : 'sz:invisible sz:opacity-0 sz:pointer-events-none'
                    }
                    sz:text-gray-400
                    sz:hover:text-cyan-300
                    sz:transition-opacity
                  `}
                >
                  ✕
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
