import Footer from '@/components/Footer';
import { requestPageSummary } from '@/services/pageSummary';
import { ChatStatus, isChatWaiting } from '@/hooks/chat';
import { useThemeValue } from '@/hooks/layout';
import { useChatModel, useLocalServerValue } from '@/hooks/models';
import { modelSupportsImages } from '@/lib/modelRegistry';
import { debugLog } from '@/logs';
import {
  EditOutlined,
  FolderOutlined,
  LineChartOutlined,
  PauseOutlined,
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
  onSubmit,
  onCancel,
  onOpenHistory,
  onNewChat,
  onOpenUsage,
  onTranslateMode,
}: {
  chatStatus: ChatStatus;
  onSubmit: (text: string, images?: File[]) => Promise<void>;
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
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
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

  const handleSubmit = async (text: string) => {
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
          placeholder={t('chat.askAnything')}
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
        <div
          onMouseEnter={() => setIsCancelHovered(true)}
          onMouseLeave={() => setIsCancelHovered(false)}
          className="sz:absolute sz:bottom-8 sz:right-6 sz:flex sz:items-center sz:justify-center sz:text-gray-400 sz:hover:text-sz-cyan"
        >
          <Button
            shape="circle"
            onClick={() => onCancel()}
            icon={
              <PauseOutlined
                className={`sz:text-gray-400 ${isCancelHovered ? 'sz:text-sz-cyan' : ''}`}
              />
            }
            size="large"
          ></Button>
        </div>
      )}
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default ChatInput;
