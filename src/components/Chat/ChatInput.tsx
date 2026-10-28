import AttachMenu from '@/components/Chat/AttachMenu';
import AttachmentChips, { AttachedItem } from '@/components/Chat/AttachmentChips';
import TabMentionPicker, { TabMentionPickerHandle } from '@/components/Chat/TabMentionPicker';
import Footer from '@/components/Footer';
import { LONG_PASTE_CHARS, MAX_ATTACHED_TABS, SUMMARY_PAGE_TEXT_MAX_CHARS } from '@/config/constants';
import { requestPageSummary } from '@/services/pageSummary';
import { useActiveWebTab } from '@/hooks/activeTab';
import { ChatStatus, isChatWaiting } from '@/hooks/chat';
import { useThemeValue } from '@/hooks/layout';
import { useChatModel, useLocalServerValue } from '@/hooks/models';
import type { PageAttachment } from '@/lib/indexDB';
import { modelSupportsImages, modelSupportsWebSearch } from '@/lib/modelRegistry';
import { panelPageTabId, withPageShown } from '@/lib/panelHost';
import { cropCapture, selectRegion } from '@/lib/regionCapture';
import {
  isPdfFile,
  isTextFile,
  PageRead,
  readPdfPage,
  readTabPage,
  readTextFile,
  readVideoTab,
  toPageAttachments,
} from '@/lib/tabText';
import { youtubeVideoId } from '@/lib/videoTranscript';
import { debugLog } from '@/logs';
import {
  EditOutlined,
  FolderOutlined,
  LineChartOutlined,
  PictureOutlined,
  ReadOutlined,
  SmileOutlined,
  TranslationOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Tooltip, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// The "@word" the caret is at the end of: an @ at the start or after a space, with no space after
// it, so e-mail addresses don't open the tab list.
const mentionAt = (value: string, caret: number) => {
  const match = /(^|\s)@(\S*)$/.exec(value.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
};

const ChatInput = ({
  chatStatus,
  threadPageUrls,
  previousPrompts,
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
  // This chat's questions, oldest first, for recalling with the arrow keys.
  previousPrompts: string[];
  onSubmit: (
    text: string,
    images?: File[],
    attachments?: PageAttachment[],
    webSearch?: boolean
  ) => Promise<void>;
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
  // Which of previousPrompts the chat box shows after ↑, until it is edited or sent.
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  // Stays on for the questions after it until it is turned off.
  const [webSearch, setWebSearch] = useState(false);
  const mentionPicker = useRef<TabMentionPickerHandle>(null);
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
  const webSearchSupported = modelSupportsWebSearch(chatModel);

  // Drop attached images when the chat model is switched to a text-only one.
  useEffect(() => {
    if (!imagesSupported) setUploadedImages([]);
  }, [imagesSupported]);

  useEffect(() => {
    if (!webSearchSupported) setWebSearch(false);
  }, [webSearchSupported]);

  // Attached tabs are read as they are now; files and pasted text were read when added. A question
  // is required: a page alone is a summary.
  const handleSubmitWithPages = async (text: string) => {
    if (text === '' || isReadingPages || attached.some((item) => item.loading)) return;
    const items = attached;
    setIsReadingPages(true);
    const results = await Promise.all(
      items.map((item): PageRead | Promise<PageRead> =>
        item.tabId !== undefined
          ? item.video
            ? readAttachedVideo(item)
            : readTabPage(item.tabId)
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
    onSubmit(text, uploadedImages, toPageAttachments(pages, SUMMARY_PAGE_TEXT_MAX_CHARS), webSearch);
    setChatInput('');
    setUploadedImages([]);
    setAttached([]);
  };

  // A YouTube video's captions are read as soon as it is attached (pressing the player's CC button
  // and putting it back if the player hasn't fetched them yet), not when the question is sent.
  const attachTab = (tab: chrome.tabs.Tab) => {
    const key = `tab-${tab.id}`;
    const video = youtubeVideoId(tab.url) !== null;
    setAttached((current) => [
      ...current,
      {
        key,
        tabId: tab.id!,
        title: tab.title ?? '',
        url: tab.url!,
        ...(video ? { video: true, loading: true } : {}),
      },
    ]);
    if (!video) return;
    void readVideoTab(tab.id!).then((result) => {
      const page = 'page' in result && result.page.captions ? result.page : undefined;
      setAttached((current) =>
        current.map((item) =>
          item.key === key
            ? { ...item, loading: false, page, captions: !!page, videoId: youtubeVideoId(page?.url) }
            : item
        )
      );
    });
  };

  // Captions read when the video was attached, while its tab still shows that video. Otherwise
  // (another video now, or none read) the tab is read again.
  const readAttachedVideo = async (item: AttachedItem): Promise<PageRead> => {
    const tab = await chrome.tabs.get(item.tabId!).catch(() => null);
    if (item.page && item.videoId && youtubeVideoId(tab?.url) === item.videoId) {
      return { page: item.page };
    }
    return readVideoTab(item.tabId!);
  };

  // Picking from the @ list attaches the tabs and takes the "@word" out of the chat box.
  const handleMentionPick = (tabs: chrome.tabs.Tab[]) => {
    if (mention) {
      setChatInput(
        (value) => value.slice(0, mention.start) + value.slice(mention.start + 1 + mention.query.length)
      );
    }
    tabs.forEach(attachTab);
    setMention(null);
  };

  const handleToggleTab = (tab: chrome.tabs.Tab, attach: boolean) => {
    if (attach) attachTab(tab);
    else setAttached((current) => current.filter((item) => item.tabId !== tab.id));
  };

  const attachFile = async (file: File) => {
    const key = crypto.randomUUID();
    const pdf = isPdfFile(file);
    setAttached((current) => [
      ...current,
      { key, title: file.name, url: '', pdf, file: !pdf, loading: true },
    ]);
    const result = pdf
      ? await readPdfPage(await file.arrayBuffer(), file.name, '')
      : await readTextFile(file);
    setAttached((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, loading: false, ...('page' in result ? { page: result.page } : { error: result.error }) }
          : item
      )
    );
  };

  // PDF, text and code files, picked or dropped, until the message holds MAX_ATTACHED_TABS.
  const handlePickFiles = (files: File[]) => {
    const readable = files.filter((file) => isPdfFile(file) || isTextFile(file));
    readable.slice(0, MAX_ATTACHED_TABS - attached.length).forEach((file) => void attachFile(file));
  };

  // What the page the panel works on shows now, attached like any other image.
  const handleCapture = async () => {
    setCaptureFailed(false);
    try {
      const dataUrl = await withPageShown((tab) =>
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 })
      );
      const blob = await (await fetch(dataUrl)).blob();
      setUploadedImages((prev) => [...prev, new File([blob], 'screenshot.jpg', { type: blob.type })]);
    } catch (error) {
      debugLog('ChatInput: [handleCapture] error', error);
      setCaptureFailed(true);
    }
  };

  // A part of the page the user drags over, cut from a capture of the view.
  const handleCaptureRegion = async () => {
    setCaptureFailed(false);
    try {
      const image = await withPageShown(async (tab) => {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: selectRegion,
          args: [t('chat.captureRegionHint')],
        });
        const region = injection?.result;
        if (!region) return undefined;
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        return cropCapture(dataUrl, region);
      });
      if (image) setUploadedImages((prev) => [...prev, image]);
    } catch (error) {
      debugLog('ChatInput: [handleCaptureRegion] error', error);
      setCaptureFailed(true);
    }
  };

  const handleSubmit = async (text: string) => {
    setRecallIndex(null);
    setMention(null);
    if (attached.length > 0) return handleSubmitWithPages(text);
    if (text !== '' || uploadedImages.length > 0) {
      onSubmit(text, uploadedImages, undefined, webSearch);
      setChatInput('');
      setUploadedImages([]);
    }
  };

  // ↑ in an empty chat box brings back this chat's earlier questions, newest first; ↓ goes the
  // other way and past the newest clears the box. Inside a recalled question of several lines
  // the arrows move the caret until it reaches the first or last line.
  const handleRecall = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const box = e.currentTarget;
    if (e.key === 'ArrowUp') {
      if (recallIndex === null ? chatInput !== '' : box.value.slice(0, box.selectionStart).includes('\n')) return;
      const next = recallIndex === null ? previousPrompts.length - 1 : recallIndex - 1;
      if (next < 0) return;
      e.preventDefault();
      setRecallIndex(next);
      setChatInput(previousPrompts[next]);
    } else {
      if (recallIndex === null || box.value.slice(box.selectionEnd).includes('\n')) return;
      e.preventDefault();
      const next = recallIndex + 1;
      setRecallIndex(next < previousPrompts.length ? next : null);
      setChatInput(next < previousPrompts.length ? previousPrompts[next] : '');
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isComposing && mentionPicker.current?.handleKey(e)) return;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isComposing) {
      handleRecall(e);
      return;
    }
    if (e.key === 'Enter') {
      if (e.shiftKey || isComposing) {
        return;
      }

      e.preventDefault();
      const currentValue = e.currentTarget.value.trim();
      if (isChatWaiting(chatStatus)) {
        // A new question while an answer is still coming stops that answer and goes out instead.
        if (currentValue === '' && uploadedImages.length === 0) return;
        await onCancel();
      }
      handleSubmit(currentValue);
    }
  };

  const handleMemoClick = () => {
    debugLog('ChatInput: [handleMemoClick] navigate to /shizue-memo');
    navigate('/shizue-memo');
  };

  const handleWordListClick = () => {
    navigate('/shizue-words');
  };

  const handleSummaryClick = async () => {
    debugLog('ChatInput: [handleSummaryClick] trigger summarize page');

    setSummaryFailed(false);
    try {
      const tabId = await panelPageTabId();

      if (tabId === undefined) {
        throw new Error('No active page available.');
      }

      await requestPageSummary(tabId);
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
    // Long text goes in as an attachment, leaving the chat box for the question about it.
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.length > LONG_PASTE_CHARS && attached.length < MAX_ATTACHED_TABS) {
      e.preventDefault();
      const title = t('chat.pastedText');
      setAttached((current) => [
        ...current,
        { key: crypto.randomUUID(), title, url: '', pasted: true, page: { title, url: '', text, pasted: true } },
      ]);
      return;
    }

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
    handlePickFiles(files.filter((file) => !file.type.startsWith('image/')));
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
              onPickFiles={handlePickFiles}
              onCapture={handleCapture}
              onCaptureRegion={handleCaptureRegion}
              webSearch={webSearch}
              webSearchSupported={webSearchSupported}
              onToggleWebSearch={() => setWebSearch((on) => !on)}
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
                  {t('words.title')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => handleWordListClick()}
                type="text"
                icon={
                  <ReadOutlined
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
          webSearch={webSearch}
          onWebSearchOff={() => setWebSearch(false)}
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
        <TabMentionPicker
          ref={mentionPicker}
          query={mention?.query ?? null}
          attachedTabIds={attached.flatMap((item) => (item.tabId !== undefined ? [item.tabId] : []))}
          attachedCount={attached.length}
          onPick={handleMentionPick}
          onClose={() => setMention(null)}
        >
          <Input.TextArea
            value={chatInput}
            onChange={(e) => {
              setChatInput(e.target.value);
              setRecallIndex(null);
              setMention(mentionAt(e.target.value, e.target.selectionStart));
            }}
            // Chrome's permission prompt for tab groups takes focus from the whole panel; only a
            // click elsewhere in the panel closes the @ list.
            onBlur={() => {
              if (document.hasFocus()) setMention(null);
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            placeholder={
              attached.length === 0
                ? t('chat.askAnything')
                : attached.every((item) => item.video)
                  ? t('chat.askAboutVideos')
                  : t('chat.askAboutPages')
            }
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
        </TabMentionPicker>
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
