import TopMenu from '@/components/Chat/TopRightMenu';
import Footer from '@/components/Footer';
import MemoListModalContent from '@/components/Memo/MemoListModalContent';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModal from '@/components/Setting/SettingsModal';
import { threadIdAtom } from '@/hooks/global';
import { getI8NLanguage, useLanguage } from '@/hooks/language';
import { useThemeValue } from '@/hooks/layout';
import { createMemo, listMemos, updateMemo, type Memo } from '@/lib/indexDB';
import { debugLog } from '@/logs';
import { HomeOutlined, MenuOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Tooltip } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import localizedFormat from 'dayjs/plugin/localizedFormat';

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

const Memo = () => {
  const theme = useThemeValue();
  const iconColor = theme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoListOpen, setIsMemoListOpen] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setThreadId = useSetAtom(threadIdAtom);
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  // Load and select the most recent memo on mount
  useEffect(() => {
    const loadInitialMemo = async () => {
      try {
        const memos = await listMemos();
        if (memos.length > 0) {
          // Sort memos with pinned first, then by update time
          const sortedMemos = [...memos].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.updatedAt - a.updatedAt;
          });

          // Select the first memo (either pinned or most recent)
          const firstMemo = sortedMemos[0];
          handleSelectMemo(firstMemo);
        }
      } catch (error) {
        debugLog('Memo: Failed to load initial memo:', error);
      }
    };

    loadInitialMemo();
  }, []);

  const handleNavigateToChat = async () => {
    debugLog('Memo: Navigate to chat triggered');
    setThreadId(undefined);
    setTimeout(() => {
      navigate('/');
    }, 100);
  };

  const handleTopMenuSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const handleOpenMemoList = () => {
    setIsMemoListOpen(true);
  };

  const handleCloseMemoList = () => {
    setIsMemoListOpen(false);
  };

  const handleCreateMemo = async () => {
    try {
      const newMemoId = await createMemo(t('memo.defaultTitle'));
      const newMemo: Memo = {
        id: newMemoId,
        title: t('memo.defaultTitle'),
        content: '',
        isPinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setSelectedMemo(newMemo);
      setEditingTitle(newMemo.title);
      setEditingContent(newMemo.content);
    } catch (error) {
      debugLog('Memo: Failed to create memo:', error);
    }
  };

  const handleSelectMemo = (memo: Memo) => {
    setSelectedMemo(memo);
    setEditingTitle(memo.title);
    setEditingContent(memo.content);
  };

  const handleAutoSave = async (title: string, content: string) => {
    if (!selectedMemo) return;

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save
    const timeout = setTimeout(async () => {
      try {
        await updateMemo(selectedMemo.id, {
          title: title || t('memo.defaultTitle'),
          content: content,
        });
        setSelectedMemo({
          ...selectedMemo,
          title: title || t('memo.defaultTitle'),
          content: content,
          updatedAt: Date.now(),
        });
      } catch (error) {
        debugLog('Memo: Failed to save memo:', error);
      }
    }, 500); // Auto-save after 500ms of no typing

    setSaveTimeout(timeout);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setEditingTitle(newTitle);
    handleAutoSave(newTitle, editingContent);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditingContent(newContent);
    handleAutoSave(editingTitle, newContent);
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (selectedMemo?.id === memoId) {
      // Load remaining memos and select the first one
      try {
        const memos = await listMemos();
        const remainingMemos = memos.filter((m) => m.id !== memoId);

        if (remainingMemos.length > 0) {
          // Sort memos with pinned first, then by update time
          const sortedMemos = [...remainingMemos].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.updatedAt - a.updatedAt;
          });

          // Select the first memo
          const firstMemo = sortedMemos[0];
          handleSelectMemo(firstMemo);
        } else {
          // No memos left, clear the selection
          setSelectedMemo(null);
          setEditingTitle('');
          setEditingContent('');
        }
      } catch (error) {
        debugLog('Memo: Failed to load memos after deletion:', error);
        setSelectedMemo(null);
        setEditingTitle('');
        setEditingContent('');
      }
    }
  };

  return (
    <div
      className={`sz-sidepanel sz:flex sz:flex-col sz:h-screen sz:font-ycom ${
        theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
      }`}
    >
      <div
        className={'sz-pdf sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center sz:font-ycom'}
      >
        <Tooltip
          title={
            <div className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}>
              {t('home.title')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
          className="sz:font-ycom"
          placement="bottomLeft"
          arrow={false}
        >
          <button
            className={`
            sz:fixed
            sz:top-3
            sz:left-4
            sz:z-10
            sz:p-[3px]
            sz:rounded
            sz:cursor-pointer
            sz:flex
            sz:flex-col
            sz:gap-2
            ${theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'}
          `}
            onClick={() => handleNavigateToChat()}
          >
            <HomeOutlined
              style={{
                fontSize: 22,
                color: iconColor,
              }}
            />
          </button>
        </Tooltip>
        <TopMenu onSettingsClick={handleTopMenuSettingsClick} />

        {/* 메모 목록 버튼 */}
        <div className="sz:fixed sz:top-3 sz:left-12 sz:z-10">
          <Tooltip
            title={
              <div
                className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}
              >
                {t('memo.memoList')}
              </div>
            }
            color={theme == 'dark' ? '#505362' : 'white'}
            className="sz:font-ycom"
            placement="bottom"
            arrow={false}
          >
            <button
              className={`
                sz:p-[3px]
                sz:rounded
                sz:cursor-pointer
                sz:flex
                sz:items-center
                sz:justify-center
                ${theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'}
              `}
              onClick={handleOpenMemoList}
            >
              <MenuOutlined
                style={{
                  fontSize: 22,
                  color: iconColor,
                }}
              />
            </button>
          </Tooltip>
        </div>

        {/* 새 메모 버튼 */}
        <div className="sz:fixed sz:top-3 sz:left-20 sz:z-10">
          <Tooltip
            title={
              <div
                className={`sz:font-ycom ${theme == 'dark' ? 'sz:text-white' : 'sz:text-black'}`}
              >
                {t('memo.newMemo')}
              </div>
            }
            color={theme == 'dark' ? '#505362' : 'white'}
            className="sz:font-ycom"
            placement="bottom"
            arrow={false}
          >
            <button
              className={`
                sz:p-[3px]
                sz:rounded
                sz:cursor-pointer
                sz:flex
                sz:items-center
                sz:justify-center
                ${theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'}
              `}
              onClick={handleCreateMemo}
            >
              <PlusOutlined
                style={{
                  fontSize: 22,
                  color: iconColor,
                }}
              />
            </button>
          </Tooltip>
        </div>

        <div
          className="
            sz:w-full
            sz:h-full
            sz:flex
            sz:flex-col
            sz:pt-11
            sz:px-4
            sz:font-ddin 
          "
        >
          {/* 메모 편집기 */}
          <div className="sz:flex-1 sz:flex sz:flex-col">
            {selectedMemo ? (
              <>
                {/* 메모 헤더 */}
                <div
                  className={`
                    sz:pt-2
                    sz:pb-1
                    sz:border-b 
                    sz:flex 
                    sz:items-center 
                    sz:justify-between
                    ${theme === 'dark' ? 'sz:border-gray-700' : 'sz:border-gray-200'}
                  `}
                >
                  <div className="sz:flex sz:items-center sz:gap-3 sz:flex-1">
                    <Input
                      value={editingTitle}
                      onChange={handleTitleChange}
                      className="sz:font-semibold sz:text-lg sz:font-ddin"
                      variant="borderless"
                      placeholder={t('memo.memoTitlePlaceholder')}
                    />
                  </div>
                </div>

                {/* 메모 내용 */}
                <div className="sz:flex-1 sz:py-3 sz:overflow-y-auto">
                  <Input.TextArea
                    value={editingContent}
                    onChange={handleContentChange}
                    className="sz:h-full sz:font-ddin"
                    placeholder={t('memo.memoContentPlaceholder')}
                    variant="borderless"
                    style={{ resize: 'none' }}
                  />
                </div>

                {/* 메모 정보 */}
                <div
                  className={`
                    sz:py-3 
                    sz:border-t 
                    sz:text-xs 
                    sz:text-gray-500
                    ${theme === 'dark' ? 'sz:border-gray-700' : 'sz:border-gray-200'}
                  `}
                >
                  {dayjs(selectedMemo.updatedAt).format('LLL')}
                </div>
              </>
            ) : (
              <div className="sz:flex-1 sz:flex sz:items-center sz:justify-center">
                <div className="sz:text-center sz:pb-50">
                  <p
                    className={`sz:text-sm sz:mb-[7px] ${
                      theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500'
                    }`}
                  >
                    {t('memo.selectMemoOr')}
                  </p>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleCreateMemo}
                    className="sz:font-ycom"
                  >
                    {t('memo.createNewMemo')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settings Modal */}
        {isSettingsOpen && (
          <SettingsModal onClose={closeSettings} />
        )}

        {/* Memo List Modal */}
        {isMemoListOpen && (
          <SidePanelFullModal
            onClose={handleCloseMemoList}
            size="large"
            minHeight="400px"
            content={
              <MemoListModalContent
                onClose={handleCloseMemoList}
                onSelectMemo={handleSelectMemo}
                onCreateMemo={handleCreateMemo}
                onDeleteMemo={handleDeleteMemo}
                selectedMemoId={selectedMemo?.id}
              />
            }
          />
        )}
      </div>
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default Memo;
