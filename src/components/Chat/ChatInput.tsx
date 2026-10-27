import AttachMenu from '@/components/Chat/AttachMenu';
import AttachmentChips, { AttachedItem } from '@/components/Chat/AttachmentChips';
import Footer from '@/components/Footer';
import { MAX_ATTACHED_TABS, SUMMARY_PAGE_TEXT_MAX_CHARS } from '@/config/constants';
import { requestPageSummary } from '@/services/pageSummary';
import { useActiveWebTab } from '@/hooks/activeTab';
import { ChatStatus, isChatWaiting } from '@/hooks/chat';
import { useThemeValue } from '@/hooks/layout';
import { useChatModel, useLocalServerValue } from '@/hooks/models';
import type { PageAttachment } from '@/lib/indexDB';
import { modelSupportsImages } from '@/lib/modelRegistry';
import { PageRead, readPdfPage, readTabPage, toPageAttachments } from '@/lib/tabText';
import { debugLog } from '@/logs';
import {
  EditOutlined,
  FolderOutlined,
  LineChartOutlined,
  PictureOutlined,
  SmileOutlined,
  TranslationOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Tooltip, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const ChatInput = ({
  chatStatus,
  threadPageUrls,
  onSubmit,
  onCancel,
  onOpenHistory,
  onNewChat,
  onOpenUsage,
  onTranslateMode,
}: {
  chatStatus: ChatStatus;
  // Pages already in this chat (attached or summarized), not offered for attaching again.
  threadPageUrls: string[];
  onSubmit: (text: string, images?: File[], attachments?: PageAttachment[]) => Promise<void>;
  onCancel: () => Promise<void>;
  onOpenHistory: () => void;
  onNewChat: () => Promise<void>;
  onOpenUsage: () => void;
  onTranslateMode: () => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [chatInput, setChatInput] = useState('');
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [attached, setAttached] = useState<AttachedItem[]>([]);
  const [isReadingPages, setIsReadingPages] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const activeTab = useActiveWebTab();
  const suggestedTab =
    activeTab &&
    attached.length < MAX_ATTACHED_TABS &&
    !attached.some((item) => item.tabId === activeTab.id || item.url === activeTab.url) &&
    !threadPageUrls.includes(activeTab.url!)
      ? activeTab
      : undefined;
  const theme = useThemeValue();
  const iconColor = theme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
  const disabledIconColor = theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  const navigate = useNavigate();
  const [chatModel] = useChatModel();
  const localServer = useLocalServerValue();
  const imagesSupported = modelSupportsImages(chatModel, localServer);

  // Drop attached images when the chat model is switched to a text-only one.
  useEffect(() => {
    if (!imagesSupported) setUploadedImages([]);
  }, [imagesSupported]);

  // Attached tabs are read as they are now; PDF files were read when picked. A question is
  // required: a page alone is a summary.
  const handleSubmitWithPages = async (text: string) => {
    if (text === '' || isReadingPages || attached.some((item) => item.loading)) return;
    const items = attached;
    setIsReadingPages(true);
    const results = await Promise.all(
      items.map((item): PageRead | Promise<PageRead> =>
        item.tabId !== undefined
          ? readTabPage(item.tabId)
          : item.page
          ? { page: item.page }
          : { error: item.error ?? 'unreadable' }
      )
    );
    setIsReadingPages(false);

    const pages = results.flatMap((result) => ('page' in result ? [result.page] : []));
    if (pages.length < items.length) {
      setAttached((current) =>
        current.map((item) => {
          const result = results[items.findIndex((i) => i.key === item.key)];
          return { ...item, error: result && 'error' in result ? result.error : undefined };
        })
      );
      return;
    }
    onSubmit(text, uploadedImages, toPageAttachments(pages, SUMMARY_PAGE_TEXT_MAX_CHARS));
    setChatInput('');
    setUploadedImages([]);
    setAttached([]);
  };

  const attachTab = (tab: chrome.tabs.Tab) =>
    setAttached((current) => [
      ...current,
      { key: `tab-${tab.id}`, tabId: tab.id!, title: tab.title ?? '', url: tab.url! },
    ]);

  const handleToggleTab = (tab: chrome.tabs.Tab, attach: boolean) => {
    if (attach) attachTab(tab);
    else setAttached((current) => current.filter((item) => item.tabId !== tab.id));
  };

  const handlePickPdf = async (file: File) => {
    const key = crypto.randomUUID();
    setAttached((current) => [...current, { key, title: file.name, url: '', pdf: true, loading: true }]);
    const result = await readPdfPage(await file.arrayBuffer(), file.name, '');
    setAttached((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, loading: false, ...('page' in result ? { page: result.page } : { error: result.error }) }
          : item
      )
    );
  };

  // What the side panel's window shows now, attached like any other image.
  const handleCapture = async () => {
    setCaptureFailed(false);
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 });
      const blob = await (await fetch(dataUrl)).blob();
      setUploadedImages((prev) => [...prev, new File([blob], 'screenshot.jpg', { type: blob.type })]);
    } catch (error) {
      debugLog('ChatInput: [handleCapture] error', error);
      setCaptureFailed(true);
    }
  };

  const handleSubmit = async (text: string) => {
    if (attached.length > 0) return handleSubmitWithPages(text);
    if (text !== '' || uploadedImages.length > 0) {
      onSubmit(text, uploadedImages);
      setChatInput('');
      setUploadedImages([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey || isComposing) {
        return;
      }

      e.preventDefault();
      if (isChatWaiting(chatStatus)) return;
      const currentValue = e.currentTarget.value.trim();
      handleSubmit(currentValue);
    }
  };

  const handleMemoClick = () => {
    debugLog('ChatInput: [handleMemoClick] navigate to /shizue-memo');
    navigate('/shizue-memo');
  };

  const handleSummaryClick = async () => {
    debugLog('ChatInput: [handleSummaryClick] trigger summarize page');

    setSummaryFailed(false);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab?.id === undefined) {
        throw new Error('No active page available.');
      }

      await requestPageSummary(tab.id);
    } catch (error) {
      debugLog('ChatInput: [handleSummaryClick] error', error);
      setSummaryFailed(true);
    }
  };

  const handleTranslateModeClick = () => {
    debugLog('ChatInput: [handleTranslateModeClick]');
    onTranslateMode();
  };

  const handleImageUpload = (file: File) => {
    setUploadedImages((prev) => [...prev, file]);
    return false;
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !imagesSupported) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          setUploadedImages((prev) => [...prev, file]);
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length > 0 && imagesSupported) {
      setUploadedImages((prev) => [...prev, ...imageFiles]);
    }
  };

  return (
    <div className="sz-chat-input sz:w-full sz:px-2 sz:flex sz:flex-col sz:items-center sz:justify-center">
      {summaryFailed && <Alert type="warning" showIcon closable onClose={() => setSummaryFailed(false)}
        className="sz:w-full sz:mb-2 sz:font-ycom" message={t('chat.pageUnavailable')} />}
      {captureFailed && <Alert type="warning" showIcon closable onClose={() => setCaptureFailed(false)}
        className="sz:w-full sz:mb-2 sz:font-ycom" message={t('chat.captureFailed')} />}
      <div className="sz:flex sz:flex-col sz:w-full sz:h-45 sz:px-2">
        <div className="sz:flex sz:items-center sz:justify-center">
          <div className="sz:flex sz:w-full sz:items-center sz:justify-start">
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('chat.history')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onOpenHistory()}
                type="text"
                icon={
                  <FolderOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('chat.newChat')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onNewChat()}
                type="text"
                icon={
                  <SmileOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('usage.title')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onOpenUsage()}
                type="text"
                icon={
                  <LineChartOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('chat.translateMode')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => handleTranslateModeClick()}
                type="text"
                icon={
                  <TranslationOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {imagesSupported ? t('chat.imageUpload') : t('chat.imageUploadNotSupported')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Upload
                beforeUpload={handleImageUpload}
                accept="image/*"
                showUploadList={false}
                multiple
                disabled={!imagesSupported}
              >
                <Button
                  type="text"
                  disabled={!imagesSupported}
                  icon={
                    <PictureOutlined
                      style={{
                        fontSize: '20px',
                        color: imagesSupported ? iconColor : disabledIconColor,
                      }}
                    />
                  }
                  size="middle"
                ></Button>
              </Upload>
            </Tooltip>
            <AttachMenu
              attachedTabIds={attached.flatMap((item) => (item.tabId !== undefined ? [item.tabId] : []))}
              full={attached.length >= MAX_ATTACHED_TABS}
              imagesSupported={imagesSupported}
              iconColor={iconColor}
              onToggleTab={handleToggleTab}
              onPickPdf={handlePickPdf}
              onCapture={handleCapture}
            />
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('memo.memo')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => handleMemoClick()}
                type="text"
                icon={
                  <EditOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('overlayMenu.summarizePage')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => handleSummaryClick()}
                type="text"
                icon={
                  <UnorderedListOutlined
                    style={{
                      fontSize: '20px',
                      color: iconColor,
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
          </div>
        </div>
        <AttachmentChips
          attached={attached}
          suggestion={suggestedTab}
          onAttach={attachTab}
          onRemove={(key) => setAttached((current) => current.filter((item) => item.key !== key))}
        />
        {uploadedImages.length > 0 && (
          <div className="sz:flex sz:flex-wrap sz:gap-2 sz:mb-2 sz:p-2">
            {uploadedImages.map((file, index) => (
              <div key={index} className="sz:relative sz:inline-block">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Preview ${index + 1}`}
                  className="sz:w-16 sz:h-16 sz:object-cover sz:rounded sz:border"
                />
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="
                    sz:cursor-pointer 
                    sz:absolute 
                    sz:-top-[5px]
                    sz:-right-[5px]
                    sz:w-4 
                    sz:h-4 
                    sz:bg-gray-400 
                    sz:text-white 
                    sz:rounded-full 
                    sz:text-[10px] 
                    sz:flex 
                    sz:items-center 
                    sz:justify-center 
                    sz:leading-none 
                    sz:hover:bg-gray-500
                  "
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <Input.TextArea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          placeholder={attached.length > 0 ? t('chat.askAboutPages') : t('chat.askAnything')}
          autoSize
          className="
            sz:w-full
            sz:h-full
            sz:font-ycom
            sz:flex
            sz:flex-col
            sz:items-start
            sz:justify-start
            sz:pt-2
            sz:placeholder:text-base
            sz:placeholder:text-gray-400
          "
        />
      </div>
      {isChatWaiting(chatStatus) && (
        // A stop square inside a spinning cyan ring: the ring shows the answer is still coming.
        <button
          type="button"
          onClick={() => onCancel()}
          className={`sz-stop-button sz:absolute sz:bottom-8 sz:right-6 sz:w-8 sz:h-8 sz:rounded-full sz:cursor-pointer sz:flex sz:items-center sz:justify-center ${
            theme == 'dark' ? 'sz:bg-[#2A2C38] sz:hover:bg-[#363948]' : 'sz:bg-gray-100 sz:hover:bg-gray-200'
          }`}
        >
          <span className="sz:absolute sz:inset-0 sz:rounded-full sz:border-2 sz:border-transparent sz:border-t-sz-cyan sz:border-r-sz-cyan sz:animate-spin sz:motion-reduce:animate-none" />
          <span
            className={`sz:w-2.5 sz:h-2.5 sz:rounded-[2.5px] ${
              theme == 'dark' ? 'sz:bg-white' : 'sz:bg-[#1C1D26]'
            }`}
          />
        </button>
      )}
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default ChatInput;
