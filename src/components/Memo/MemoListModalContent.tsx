import { getI8NLanguage, useLanguage } from '@/hooks/language';
import { useThemeValue } from '@/hooks/layout';
import { deleteMemo, listMemos, toggleMemoPinned, type Memo } from '@/lib/indexDB';
import { debugLog } from '@/logs';
import { DeleteOutlined, PlusOutlined, PushpinOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useMemo, useState } from 'react';
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

interface MemoListModalContentProps {
  onClose: () => void;
  onSelectMemo: (memo: Memo) => void;
  onCreateMemo: () => void;
  onDeleteMemo?: (memoId: string) => void;
  selectedMemoId?: string;
}

const MemoListModalContent = ({
  onClose,
  onSelectMemo,
  onCreateMemo,
  onDeleteMemo,
  selectedMemoId,
}: MemoListModalContentProps) => {
  const theme = useThemeValue();
  const [hoveredMemoId, setHoveredMemoId] = useState<string | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const { lang } = useLanguage();

  // Update dayjs locale when language changes
  useEffect(() => {
    const i18nLang = getI8NLanguage(lang);
    // Map i18n language codes to dayjs locale codes
    const dayjsLocale = i18nLang.replace('_', '-').toLowerCase();
    try {
      dayjs.locale(dayjsLocale);
    } catch {
      // Fallback to primary language code if full locale not available
      const primaryLang = dayjsLocale.split('-')[0];
      try {
        dayjs.locale(primaryLang);
      } catch {
        dayjs.locale('en');
      }
    }
  }, [lang]);

  useEffect(() => {
    loadMemos();
  }, []);

  const loadMemos = async () => {
    setIsLoading(true);
    try {
      const loadedMemos = await listMemos();
      setMemos(loadedMemos);
    } catch (error) {
      debugLog('Memo: Failed to load memos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMemo = async (id: string) => {
    try {
      await deleteMemo(id);
      await loadMemos();
      // Call parent's delete handler if provided
      if (onDeleteMemo) {
        onDeleteMemo(id);
      }
    } catch (error) {
      debugLog('Memo: Failed to delete memo:', error);
    }
  };

  const handleTogglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleMemoPinned(id);
      await loadMemos();
    } catch (error) {
      debugLog('Memo: Failed to toggle pin:', error);
    }
  };

  const handleSelectMemo = (memo: Memo) => {
    onSelectMemo(memo);
    onClose();
  };

  const filteredMemos = useMemo(() => {
    if (!searchTerm) return memos;

    const lowerSearchTerm = searchTerm.toLowerCase();
    return memos.filter(
      (memo) =>
        memo.title.toLowerCase().includes(lowerSearchTerm) ||
        memo.content.toLowerCase().includes(lowerSearchTerm)
    );
  }, [memos, searchTerm]);

  const sortedMemos = useMemo(() => {
    return [...filteredMemos].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [filteredMemos]);

  return (
    <>
      <div
        className={`sz:text-lg sz:font-semibold sz:mb-4 sz:text-center ${
          theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
        }`}
      >
        {t('memo.memoList')}
      </div>

      <div className="sz:mb-4 sz:space-y-3">
        <Input
          placeholder={t('memo.searchMemo')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`sz:font-ycom ${theme === 'dark' ? 'dark-input' : ''}`}
          allowClear
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            onCreateMemo();
            onClose();
          }}
          size="middle"
          className="sz:w-full sz:font-ycom"
        >
          {t('memo.newMemo')}
        </Button>
      </div>

      <div className="sz:flex sz:flex-col sz:gap-3 sz:overflow-y-auto sz:scrollbar-hidden sz:max-h-[50vh]">
        {!isLoading && sortedMemos.length > 0 ? (
          sortedMemos.map((memo) => {
            const isSelected = memo.id === selectedMemoId;
            const isHovered = hoveredMemoId === memo.id;
            return (
              <div
                key={memo.id}
                className="sz:flex sz:items-center"
                onMouseEnter={() => setHoveredMemoId(memo.id)}
                onMouseLeave={() => setHoveredMemoId(null)}
              >
                <Button
                  type="text"
                  className="sz:flex-1 sz:text-left sz:max-w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectMemo(memo);
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
                    height: '60px',
                  }}
                >
                  <div className="sz:flex sz:flex-col sz:justify-between sz:w-full sz:font-ycom sz:pt-2 sz:pb-2">
                    <div
                      className="sz:max-w-full sz:flex sz:flex-row sz:min-w-full sz:justify-between sz:gap-2 sz:items-center"
                      style={{
                        color: isSelected ? (theme == 'dark' ? 'white' : 'black') : '#777',
                      }}
                    >
                      <div className="sz:flex sz:items-center sz:gap-2 sz:flex-1 sz:min-w-0">
                        <div
                          className={`sz:text-sm sz:overflow-hidden sz:text-ellipsis sz:whitespace-nowrap sz:flex-1 ${
                            theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                          }`}
                        >
                          {memo.title}
                        </div>
                        {memo.isPinned && (
                          <PushpinOutlined className="sz:text-blue-500 sz:text-xs sz:flex-shrink-0" />
                        )}
                      </div>
                      <div
                        className={`sz:text-xs sz:flex-shrink-0 ${
                          theme == 'dark' ? 'sz:text-[#ccc]' : 'sz:text-gray-500'
                        }`}
                      >
                        {dayjs(memo.updatedAt).fromNow()}
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
                        {memo.content || t('memo.noContent')}
                      </div>
                      <div className="sz:text-xs sz:text-gray-500 sz:flex sz:flex-row sz:gap-1">
                        <div
                          onClick={(e) => handleTogglePin(memo.id, e)}
                          className={`sz:text-gray-400 sz:hover:text-blue-400 sz:cursor-pointer sz:w-6 sz:h-6 sz:flex sz:items-center sz:justify-center ${
                            memo.isPinned ? 'sz:text-blue-500' : ''
                          }`}
                          style={{
                            fontSize: '14px',
                            visibility: isHovered || isSelected ? 'visible' : 'hidden',
                          }}
                        >
                          <PushpinOutlined />
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMemo(memo.id);
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
          <div className="sz:text-center sz:py-8">
            <p
              className={`sz:text-sm ${theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500'}`}
            >
              {searchTerm ? t('memo.noSearchResults') : t('memo.noMemos')}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default MemoListModalContent;
