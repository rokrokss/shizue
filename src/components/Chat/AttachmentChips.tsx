import { useThemeValue } from '@/hooks/layout';
import type { PageReadError, PageText } from '@/lib/tabText';
import { FilePdfOutlined, FileTextOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

// A tab, read when the message is sent, or a PDF file, read when it was picked.
export interface AttachedItem {
  key: string;
  tabId?: number;
  page?: PageText;
  title: string;
  url: string;
  pdf?: boolean;
  // A picked PDF file still being read.
  loading?: boolean;
  // Why the tab or file couldn't be read.
  error?: PageReadError;
}

// Above the chat box: the tabs and PDF files attached to the next message, and the current tab
// offered as a dashed chip until it is attached.
const AttachmentChips = ({
  attached,
  suggestion,
  onAttach,
  onRemove,
}: {
  attached: AttachedItem[];
  suggestion?: chrome.tabs.Tab;
  onAttach: (tab: chrome.tabs.Tab) => void;
  onRemove: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();

  if (attached.length === 0 && !suggestion) return null;

  return (
    <div className="sz:flex sz:flex-wrap sz:shrink-0 sz:gap-1 sz:pt-1 sz:pb-1">
      {attached.map((item) => (
        <Tag
          key={item.key}
          icon={
            item.loading ? <LoadingOutlined /> : item.pdf ? <FilePdfOutlined /> : <FileTextOutlined />
          }
          color={item.error ? 'error' : undefined}
          closable
          onClose={(e) => {
            e.preventDefault();
            onRemove(item.key);
          }}
          title={item.url || item.title}
          className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
        >
          <span className="sz:inline-block sz:max-w-36 sz:truncate sz:align-bottom">
            {item.title || item.url}
          </span>
          {item.error ? (
            <span className="sz:ml-1">
              ·{' '}
              {item.error === 'empty' ? t('chat.attachmentEmpty') : t('chat.attachmentUnreadable')}
            </span>
          ) : null}
        </Tag>
      ))}
      {suggestion ? (
        <Tooltip
          placement="top"
          title={
            <div
              className={`sz:font-ycom sz:z-2147483647 ${
                theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
              }`}
            >
              {t('chat.attachPage')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
        >
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            aria-label={`${t('chat.attachPage')}: ${suggestion.title || suggestion.url}`}
            onClick={() => onAttach(suggestion)}
            className="sz:font-ycom"
          >
            <span className="sz:inline-block sz:max-w-36 sz:truncate sz:align-bottom">
              {suggestion.title || suggestion.url}
            </span>
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
};

export default AttachmentChips;
