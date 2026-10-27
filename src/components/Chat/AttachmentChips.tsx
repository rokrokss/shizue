import { useThemeValue } from '@/hooks/layout';
import type { PageReadError } from '@/lib/tabText';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

export interface AttachedTab {
  tabId: number;
  title: string;
  url: string;
  // Why the tab couldn't be read the last time a message with it was sent.
  error?: PageReadError;
}

// Above the chat box: the tabs attached to the next message, and the current tab offered as a
// dashed chip until it is attached.
const AttachmentChips = ({
  attached,
  suggestion,
  onAttach,
  onRemove,
}: {
  attached: AttachedTab[];
  suggestion?: chrome.tabs.Tab;
  onAttach: (tab: chrome.tabs.Tab) => void;
  onRemove: (tabId: number) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();

  if (attached.length === 0 && !suggestion) return null;

  return (
    <div className="sz:flex sz:flex-wrap sz:shrink-0 sz:gap-1 sz:pt-1 sz:pb-1">
      {attached.map((tab) => (
        <Tag
          key={tab.tabId}
          icon={<FileTextOutlined />}
          color={tab.error ? 'error' : undefined}
          closable
          onClose={(e) => {
            e.preventDefault();
            onRemove(tab.tabId);
          }}
          title={tab.url}
          className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
        >
          <span className="sz:inline-block sz:max-w-36 sz:truncate sz:align-bottom">
            {tab.title || tab.url}
          </span>
          {tab.error ? (
            <span className="sz:ml-1">
              ·{' '}
              {tab.error === 'empty' ? t('chat.attachmentEmpty') : t('chat.attachmentUnreadable')}
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
