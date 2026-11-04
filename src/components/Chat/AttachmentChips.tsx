import { useThemeValue } from '@/hooks/layout';
import type { ReasoningEffort } from '@/lib/reasoning';
import { formatVideoTime } from '@/lib/videoTranscript';
import type { PageReadError, PageText } from '@/lib/tabText';
import { videoKey, youtubeVideoId } from '@/lib/videoTranscript';
import {
  BulbOutlined,
  ClockCircleOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LoadingOutlined,
  PlaySquareOutlined,
  PlusOutlined,
  SelectOutlined,
  SnippetsOutlined,
  YoutubeOutlined,
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
  // A YouTube or Netflix video tab. Its captions are read when it is attached: `page` holds them,
  // read from `videoId` (a videoKey), and `captions` says whether there were any once the reading
  // is done.
  video?: boolean;
  captions?: boolean;
  videoId?: string | null;
  // A picked file, or a video's captions, still being read.
  loading?: boolean;
  // Why the tab or file couldn't be read.
  error?: PageReadError;
}

// Shown once a chat fills this much of the model's context.
const CONTEXT_USAGE_SHOWN = 0.5;
// From here older turns are folded into a summary (lib/chatCompaction.ts).
const CONTEXT_USAGE_FULL = 0.7;

// A small ring filled to `value` (0–1), in the text's color.
const UsageRing = ({ value }: { value: number }) => {
  const r = 5;
  const length = 2 * Math.PI * r;
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden className="sz:-rotate-90 sz:shrink-0">
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${length * Math.min(1, value)} ${length}`}
        className="sz:transition-[stroke-dasharray] sz:duration-500 sz:motion-reduce:transition-none"
      />
    </svg>
  );
};

// Above the chat box: web search or the browser agent while it is on, a thinking effort other than the default, how
// full a long chat has made the model's context, the tabs, files and pasted text attached to the
// next message, and the current tab offered as a dashed chip until it is attached.
const AttachmentChips = ({
  attached,
  suggestion,
  webSearch,
  onWebSearchOff,
  browserAgent,
  onBrowserAgentOff,
  reasoningEffort,
  onReasoningEffortReset,
  videoMoment,
  onVideoMoment,
  contextUsage,
  onAttach,
  onRemove,
}: {
  attached: AttachedItem[];
  suggestion?: chrome.tabs.Tab;
  webSearch: boolean;
  onWebSearchOff: () => void;
  browserAgent: boolean;
  onBrowserAgentOff: () => void;
  // Shown when it isn't 'medium' and the model takes one.
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortReset: () => void;
  // The chat's video: asking about the moment it is at, while `on`, and where it is now.
  videoMoment?: { on: boolean; seconds: number | null };
  onVideoMoment: (on: boolean) => void;
  // How full the model's context was for the latest answer (0–1), if known.
  contextUsage?: number | null;
  onAttach: (tab: chrome.tabs.Tab) => void;
  onRemove: (key: string) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();

  const effortChip = reasoningEffort && reasoningEffort !== 'medium';
  const usage = contextUsage != null && contextUsage >= CONTEXT_USAGE_SHOWN ? contextUsage : null;
  if (
    attached.length === 0 &&
    !suggestion &&
    !webSearch &&
    !browserAgent &&
    !effortChip &&
    !videoMoment &&
    usage === null
  )
    return null;
  const percent = usage === null ? 0 : Math.round(usage * 100);
  const attachLabel = t(videoKey(suggestion?.url) ? 'chat.attachVideo' : 'chat.attachPage');

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
      {browserAgent ? (
        <Tooltip title={t('chat.browserAgentHint')}>
          <Tag
            icon={<SelectOutlined />}
            color="cyan"
            closable
            onClose={(e) => {
              e.preventDefault();
              onBrowserAgentOff();
            }}
            className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
          >
            {t('chat.browserAgent')}
          </Tag>
        </Tooltip>
      ) : null}
      {effortChip ? (
        <Tag
          icon={<BulbOutlined />}
          color="cyan"
          closable
          onClose={(e) => {
            e.preventDefault();
            onReasoningEffortReset();
          }}
          className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
        >
          {t('chat.reasoningEffortChip', { level: t(`chat.reasoningEffort_${reasoningEffort}`) })}
        </Tag>
      ) : null}
      {videoMoment?.on ? (
        <Tag
          icon={<ClockCircleOutlined />}
          color="cyan"
          closable
          onClose={(e) => {
            e.preventDefault();
            onVideoMoment(false);
          }}
          className="sz:font-ycom sz:m-0 sz:flex sz:items-center"
        >
          {t('chat.videoMoment')}
          {videoMoment.seconds !== null ? (
            <span className="sz:ml-1 sz:tabular-nums">· {formatVideoTime(videoMoment.seconds)}</span>
          ) : null}
        </Tag>
      ) : videoMoment ? (
        <Tooltip
          placement="top"
          title={
            <div
              className={`sz:font-ycom sz:z-2147483647 ${
                theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
              }`}
            >
              {t('chat.videoMomentHint')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
        >
          <Button
            type="dashed"
            size="small"
            icon={<ClockCircleOutlined />}
            onClick={() => onVideoMoment(true)}
            className="sz:font-ycom"
          >
            {t('chat.videoMoment')}
          </Button>
        </Tooltip>
      ) : null}
      {usage !== null ? (
        <Tooltip
          placement="top"
          title={
            <div
              className={`sz:font-ycom sz:z-2147483647 ${
                theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
              }`}
            >
              {t('chat.contextUsageHint', { percent })}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
        >
          <Tag
            color={usage >= CONTEXT_USAGE_FULL ? 'warning' : undefined}
            className="sz:font-ycom sz:m-0 sz:flex sz:items-center sz:gap-1.5 sz:cursor-default"
          >
            <UsageRing value={usage} />
            <span className="sz:tabular-nums">{t('chat.contextUsage', { percent })}</span>
          </Tag>
        </Tooltip>
      ) : null}
      {attached.map((item) => (
        <Tag
          key={item.key}
          icon={
            item.loading ? (
              <LoadingOutlined />
            ) : item.video ? (
              youtubeVideoId(item.url) ? <YoutubeOutlined /> : <PlaySquareOutlined />
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
          {item.video && !item.loading && !item.error ? (
            <span className="sz:ml-1">
              · {item.captions ? t('chat.withCaptions') : t('chat.withoutCaptions')}
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
              {attachLabel}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
        >
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            aria-label={`${attachLabel}: ${suggestion.title || suggestion.url}`}
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
