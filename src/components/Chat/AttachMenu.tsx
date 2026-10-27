import { MAX_ATTACHED_TABS } from '@/config/constants';
import { useThemeValue } from '@/hooks/layout';
import {
  CameraOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { Button, Popover, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const isWebTab = (tab: chrome.tabs.Tab) => tab.id !== undefined && /^https?:/.test(tab.url ?? '');

// The paperclip button: the web tabs open in this window to attach or take off, a PDF file from
// the computer, and a capture of what the current tab shows, for models that read images.
const AttachMenu = ({
  attachedTabIds,
  full,
  imagesSupported,
  iconColor,
  onToggleTab,
  onPickPdf,
  onCapture,
}: {
  attachedTabIds: number[];
  // The next message already has MAX_ATTACHED_TABS tabs and files.
  full: boolean;
  imagesSupported: boolean;
  iconColor: string;
  onToggleTab: (tab: chrome.tabs.Tab, attach: boolean) => void;
  onPickPdf: (file: File) => void;
  onCapture: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const pdfInput = useRef<HTMLInputElement>(null);

  const handleOpenChange = async (next: boolean) => {
    if (next) setTabs((await chrome.tabs.query({ currentWindow: true })).filter(isWebTab));
    setOpen(next);
  };

  // Tabs, the PDF file and the capture share one row style, like items of one list.
  const rowClass = (disabled: boolean) =>
    `sz:flex sz:items-center sz:gap-2 sz:w-full sz:px-2 sz:py-1.5 sz:rounded-md sz:text-left ${
      disabled
        ? 'sz:opacity-50 sz:cursor-not-allowed'
        : `sz:cursor-pointer ${theme == 'dark' ? 'sz:hover:bg-white/10' : 'sz:hover:bg-black/5'}`
    }`;

  const content = (
    // Narrow enough to stay centered over the paperclip, inside a side panel at its 320px minimum.
    <div className="sz-attach-menu sz:font-ycom sz:w-52 sz:flex sz:flex-col sz:gap-1">
      <div className="sz:text-xs sz:text-gray-500 sz:px-2">{t('chat.openTabs')}</div>
      <div className="sz:max-h-64 sz:overflow-y-auto sz:flex sz:flex-col">
        {tabs.length === 0 ? (
          <div className="sz:text-xs sz:text-gray-500 sz:px-2 sz:py-2">{t('chat.noOpenTabs')}</div>
        ) : (
          tabs.map((tab) => {
            const attached = attachedTabIds.includes(tab.id!);
            // A discarded tab has no page to read until it is opened again.
            const disabled = !attached && (full || Boolean(tab.discarded));
            return (
              <label key={tab.id} className={rowClass(disabled)}>
                <input
                  type="checkbox"
                  checked={attached}
                  disabled={disabled}
                  onChange={(e) => onToggleTab(tab, e.target.checked)}
                  className="sz:w-4 sz:h-4 sz:shrink-0 sz:accent-sz-cyan sz:cursor-[inherit]"
                />
                {tab.favIconUrl ? (
                  <img src={tab.favIconUrl} alt="" className="sz:w-4 sz:h-4 sz:shrink-0" />
                ) : (
                  <FileTextOutlined className="sz:shrink-0" />
                )}
                <div className="sz:min-w-0 sz:flex-1">
                  <div className="sz:truncate sz:text-sm">{tab.title || tab.url}</div>
                  <div className="sz:truncate sz:text-xs sz:text-gray-500">
                    {tab.discarded ? t('chat.tabAsleep') : new URL(tab.url!).host}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
      {full ? (
        <div className="sz:text-xs sz:text-gray-500 sz:px-2">
          {t('chat.attachLimit', { max: MAX_ATTACHED_TABS })}
        </div>
      ) : null}
      <div
        className={`sz:flex sz:flex-col sz:pt-1 sz:mt-1 sz:border-t ${
          theme == 'dark' ? 'sz:border-white/10' : 'sz:border-black/10'
        }`}
      >
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setOpen(false);
            onPickPdf(file);
          }}
        />
        <button
          type="button"
          disabled={full}
          onClick={() => pdfInput.current?.click()}
          className={rowClass(full)}
        >
          <FilePdfOutlined className="sz:shrink-0" />
          <span className="sz:text-sm">{t('chat.attachPdf')}</span>
        </button>
        <button
          type="button"
          disabled={!imagesSupported}
          onClick={() => {
            setOpen(false);
            onCapture();
          }}
          className={rowClass(!imagesSupported)}
        >
          <CameraOutlined className="sz:shrink-0" />
          <div className="sz:min-w-0 sz:flex-1">
            <div className="sz:text-sm">{t('chat.captureScreen')}</div>
            {imagesSupported ? null : (
              <div className="sz:text-xs sz:text-gray-500">{t('chat.imageUploadNotSupported')}</div>
            )}
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="top"
      open={open}
      onOpenChange={handleOpenChange}
    >
      <span className="sz:inline-flex">
        <Tooltip
          placement="top"
          open={open ? false : undefined}
          title={
            <div
              className={`sz:font-ycom sz:z-2147483647 ${
                theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
              }`}
            >
              {t('chat.attach')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
          className="sz:font-ycom"
        >
          <Button
            type="text"
            aria-label={t('chat.attach')}
            icon={<PaperClipOutlined style={{ fontSize: '20px', color: iconColor }} />}
            size="middle"
          ></Button>
        </Tooltip>
      </span>
    </Popover>
  );
};

export default AttachMenu;
