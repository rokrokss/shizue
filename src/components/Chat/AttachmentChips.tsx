import { useThemeValue } from '@/hooks/layout';
import type { PageReadError, PageText } from '@/lib/tabText';
import {
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LoadingOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

// A tab, read when the message is sent; a PDF or text file, read when it was picked; or long
// pasted text.
export interface AttachedItem {
  key: string;
  tabId?: number;
  page?: PageText;
  title: string;
  url: string;
  pdf?: boolean;
  file?: boolean;
  pasted?: boolean;
  // A picked file still being read.
  loading?: boolean;
  // Why the tab or file couldn't be read.
  error?: PageReadError;
}

// Above the chat box: web search while it is on, the tabs, files and pasted text attached to the
// next message, and the current tab offered as a dashed chip until it is attached.
const AttachmentChips = ({
  attached,
  suggestion,
  webSearch,
  onWebSearchOff,
  onAttach,
  onRemove,
}: {
  attached: AttachedItem[];
  suggestion?: chrome.tabs.Tab;
  webSearch: boolean;
  onWebSearchOff: () => void;
  onAttach: (tab: chrome.tabs.Tab) => void;
  onRemove: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();

  if (attached.length === 0 && !suggestion && !webSearch) return null;

  return (
    <div className="sz:flex sz:flex-wrap sz:shrink-0 sz:gap-1 sz:pt-1 sz:pb-1">
      {webSearch ? (
        <Tag
          icon={<GlobalOutlined />}
          color="cyan"
          closable
          onClose={(e) => {
            e.preventDefault();
            onWebSearchOff();
          }}
          className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
        >
          {t('chat.webSearch')}
        </Tag>
      ) : null}
      {attached.map((item) => (
        <Tag
          key={item.key}
          icon={
            item.loading ? (
              <LoadingOutlined />
            ) : item.pdf ? (
              <FilePdfOutlined />
            ) : item.file ? (
              <FileOutlined />
            ) : item.pasted ? (
              <SnippetsOutlined />
            ) : (
              <FileTextOutlined />
            )
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
          {item.pasted && item.page ? (
            <span className="sz:ml-1">
              · {t('chat.pastedChars', { count: item.page.text.length.toLocaleString() })}
            </span>
          ) : null}
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
