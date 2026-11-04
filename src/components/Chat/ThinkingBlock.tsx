import MarkdownMessage from '@/components/Chat/MarkdownMessage';
import { useThemeValue } from '@/hooks/layout';
import { thinkingSeconds } from '@/lib/reasoning';
import { RightOutlined } from '@ant-design/icons';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// What the model showed of its thinking, above its answer. Open while it thinks, with the seconds
// counting; it folds into "Thought for 12s" once the answer starts, and opens again on a click.
const ThinkingBlock = ({
  reasoning,
  thinkingMs,
  thinking,
}: {
  reasoning: string;
  thinkingMs?: number;
  // The model is still thinking: no answer yet.
  thinking: boolean;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [open, setOpen] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thinking]);

  // While it thinks, the newest thinking stays in view.
  useEffect(() => {
    if (thinking && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [reasoning, thinking]);

  const expanded = thinking || open;
  const seconds = thinkingSeconds(thinking ? now - startedAt : thinkingMs ?? 0);
  const label = thinking
    ? t('chat.thinking', { seconds })
    : thinkingMs !== undefined
    ? t('chat.thoughtFor', { seconds })
    : t('chat.thought');

  return (
    <div
      className="sz-thinking sz:flex sz:flex-col sz:items-start sz:pb-2"
      style={
        {
          '--sz-thinking-dim': theme == 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
          '--sz-thinking-bright': theme == 'dark' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)',
        } as CSSProperties
      }
    >
      <button
        type="button"
        aria-expanded={expanded}
        disabled={thinking}
        onClick={() => setOpen((value) => !value)}
        className={`sz:flex sz:items-center sz:gap-1.5 sz:text-xs sz:font-ycom sz:rounded-md sz:py-0.5 sz:pr-1.5 sz:-ml-0.5 sz:pl-0.5 ${
          thinking
            ? 'sz-thinking-live sz:cursor-default'
            : `sz:cursor-pointer sz:text-gray-500 ${
                theme == 'dark' ? 'sz:hover:text-gray-300' : 'sz:hover:text-gray-700'
              }`
        }`}
      >
        <RightOutlined
          className={`sz:text-[9px] sz:transition-transform sz:duration-200 sz:motion-reduce:transition-none ${
            expanded ? 'sz:rotate-90' : ''
          }`}
        />
        <span className="sz-thinking-label">{label}</span>
      </button>
      <div
        className={`sz:grid sz:w-full sz:transition-[grid-template-rows,opacity] sz:duration-300 sz:ease-out sz:motion-reduce:transition-none ${
          expanded ? 'sz:grid-rows-[1fr] sz:opacity-100' : 'sz:grid-rows-[0fr] sz:opacity-0'
        }`}
      >
        <div className="sz:overflow-hidden">
          <div
            ref={body}
            className={`sz-thinking-body sz:mt-1 sz:ml-1 sz:pl-3 sz:border-l-2 sz:max-h-40 sz:overflow-y-auto sz:text-xs sz:leading-5 sz:text-gray-500 ${
              theme == 'dark' ? 'sz:border-white/15' : 'sz:border-black/10'
            }`}
            style={{ scrollbarWidth: 'thin' }}
          >
            <MarkdownMessage content={reasoning} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingBlock;
