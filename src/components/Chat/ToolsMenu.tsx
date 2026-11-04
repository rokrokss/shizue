import { attachRowClass, toolbarButtonStyle } from '@/components/Chat/AttachMenu';
import { useThemeValue } from '@/hooks/layout';
import { REASONING_EFFORTS, type ReasoningEffort } from '@/lib/reasoning';
import { BulbOutlined, ControlOutlined, GlobalOutlined, SelectOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Popover, Tooltip } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// The tools button: how Shizue answers the questions that follow, with web search or the browser
// agent (asking before it sends, deletes or pays, or not), and how hard the model thinks. What goes
// with a question is the paperclip's (AttachMenu).
const ToolsMenu = ({
  iconColor,
  webSearch,
  webSearchSupported,
  onToggleWebSearch,
  browserAgent,
  onToggleBrowserAgent,
  autoApprove,
  onToggleAutoApprove,
  reasoningEffort,
  reasoningSupported,
  onReasoningEffort,
}: {
  iconColor: string;
  webSearch: boolean;
  webSearchSupported: boolean;
  onToggleWebSearch: () => void;
  browserAgent: boolean;
  onToggleBrowserAgent: () => void;
  autoApprove: boolean;
  onToggleAutoApprove: () => void;
  reasoningEffort: ReasoningEffort;
  reasoningSupported: boolean;
  onReasoningEffort: (effort: ReasoningEffort) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [open, setOpen] = useState(false);
  const rowClass = (disabled: boolean) => attachRowClass(disabled, theme);

  const content = (
    <div className="sz-tools-menu sz:font-ycom sz:w-52 sz:flex sz:flex-col">
      <label className={rowClass(!webSearchSupported)}>
        <GlobalOutlined className="sz:shrink-0" />
        <div className="sz:min-w-0 sz:flex-1">
          <div className="sz:text-sm">{t('chat.webSearch')}</div>
          <div className="sz:text-xs sz:text-gray-500">
            {webSearchSupported ? t('chat.webSearchHint') : t('chat.webSearchNotSupported')}
          </div>
        </div>
        <input
          type="checkbox"
          checked={webSearch}
          disabled={!webSearchSupported}
          onChange={onToggleWebSearch}
          className="sz:w-4 sz:h-4 sz:shrink-0 sz:accent-sz-cyan sz:cursor-[inherit]"
        />
      </label>
      <label className={rowClass(false)}>
        <SelectOutlined className="sz:shrink-0" />
        <div className="sz:min-w-0 sz:flex-1">
          <div className="sz:text-sm">{t('chat.browserAgent')}</div>
          <div className="sz:text-xs sz:text-gray-500">{t('chat.browserAgentHint')}</div>
        </div>
        <input
          type="checkbox"
          checked={browserAgent}
          onChange={onToggleBrowserAgent}
          className="sz:w-4 sz:h-4 sz:shrink-0 sz:accent-sz-cyan sz:cursor-[inherit]"
        />
      </label>
      {browserAgent ? (
        <div className="sz:pl-6">
          <label className={rowClass(false)}>
            <ThunderboltOutlined className="sz:shrink-0 sz:text-amber-500" />
            <div className="sz:min-w-0 sz:flex-1">
              <div className="sz:text-sm">{t('chat.autoApprove')}</div>
              <div className="sz:text-xs sz:text-gray-500">{t('chat.autoApproveHint')}</div>
            </div>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={onToggleAutoApprove}
              className="sz:w-4 sz:h-4 sz:shrink-0 sz:accent-amber-500 sz:cursor-[inherit]"
            />
          </label>
        </div>
      ) : null}
      <div
        className={`sz:flex sz:flex-col sz:gap-1.5 sz:px-2 sz:py-1.5 ${
          reasoningSupported ? '' : 'sz:opacity-50'
        }`}
      >
        <div className="sz:flex sz:items-center sz:gap-2">
          <BulbOutlined className="sz:shrink-0" />
          <div className="sz:min-w-0 sz:flex-1">
            <div className="sz:text-sm">{t('chat.reasoningEffort')}</div>
            <div className="sz:text-xs sz:text-gray-500">
              {reasoningSupported
                ? t(`chat.reasoningEffortHint_${reasoningEffort}`)
                : t('chat.reasoningEffortNotSupported')}
            </div>
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label={t('chat.reasoningEffort')}
          className={`sz:flex sz:p-0.5 sz:rounded-md ${theme == 'dark' ? 'sz:bg-white/10' : 'sz:bg-black/5'}`}
        >
          {REASONING_EFFORTS.map((effort) => {
            const selected = effort === reasoningEffort;
            return (
              <button
                key={effort}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!reasoningSupported}
                onClick={() => onReasoningEffort(effort)}
                className={`sz:flex-1 sz:py-0.5 sz:rounded sz:text-xs sz:transition-colors sz:duration-150 sz:focus-visible:outline-2 sz:focus-visible:outline-sz-cyan ${
                  reasoningSupported ? 'sz:cursor-pointer' : 'sz:cursor-not-allowed'
                } ${
                  selected
                    ? theme == 'dark'
                      ? 'sz:bg-white/20 sz:text-white'
                      : 'sz:bg-white sz:text-black sz:shadow-sm'
                    : 'sz:text-gray-500'
                }`}
              >
                {t(`chat.reasoningEffort_${effort}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="top" open={open} onOpenChange={setOpen}>
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
              {t('chat.tools')}
            </div>
          }
          color={theme == 'dark' ? '#505362' : 'white'}
          className="sz:font-ycom"
        >
          <Button
            type="text"
            aria-label={t('chat.tools')}
            icon={<ControlOutlined style={{ fontSize: '20px', color: iconColor }} />}
            size="middle"
            style={toolbarButtonStyle}
          ></Button>
        </Tooltip>
      </span>
    </Popover>
  );
};

export default ToolsMenu;
