import { attachRowClass, toolbarButtonStyle } from '@/components/Chat/AttachMenu';
import { useThemeValue } from '@/hooks/layout';
import type { ModelOption } from '@/hooks/models';
import type { ChatModel } from '@/lib/modelRegistry';
import { BASE_REASONING_EFFORTS, type ReasoningEffort } from '@/lib/reasoning';
import {
  BulbOutlined,
  ControlOutlined,
  GlobalOutlined,
  RobotOutlined,
  SelectOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Popover, Select, Tooltip } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// The tools button: how Shizue answers the questions that follow, with web search or the browser
// agent (asking before it sends, deletes or pays, or not), with which chat model, and how hard it
// thinks. What goes with a question is the paperclip's (AttachMenu).
const ToolsMenu = ({
  iconColor,
  webSearch,
  webSearchSupported,
  onToggleWebSearch,
  browserAgent,
  onToggleBrowserAgent,
  autoApprove,
  onToggleAutoApprove,
  chatModel,
  chatModelOptions,
  onChatModel,
  reasoningEffort,
  reasoningEfforts,
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
  chatModel: ChatModel;
  // The models usable now without changing the AI provider.
  chatModelOptions: ModelOption[];
  onChatModel: (model: ChatModel) => void;
  reasoningEffort: ReasoningEffort;
  // The chat model's efforts; none when it takes none, and the base ones are shown disabled.
  reasoningEfforts: ReasoningEffort[];
  onReasoningEffort: (effort: ReasoningEffort) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [open, setOpen] = useState(false);
  const rowClass = (disabled: boolean) => attachRowClass(disabled, theme);
  const reasoningSupported = reasoningEfforts.length > 0;
  const effortStops = reasoningSupported ? reasoningEfforts : BASE_REASONING_EFFORTS;
  const effortIndex = Math.max(0, effortStops.indexOf(reasoningEffort));
  // The stop nearest the pointer, along the track's knob-wide ends.
  const pickEffortAt = (track: HTMLElement, clientX: number) => {
    const { left, width } = track.getBoundingClientRect();
    const knob = track.firstElementChild!.getBoundingClientRect().width;
    const at = Math.round(((clientX - left - knob / 2) / Math.max(1, width - knob)) * (effortStops.length - 1));
    const effort = effortStops[Math.min(effortStops.length - 1, Math.max(0, at))];
    if (effort !== reasoningEffort) onReasoningEffort(effort);
  };

  const content = (
    <div className="sz-tools-menu sz:font-ycom sz:w-52 sz:flex sz:flex-col">
      <label className={rowClass(!webSearchSupported)}>
        <GlobalOutlined className="sz:shrink-0" />
        <div className="sz:min-w-0 sz:flex-1">
          <div className="sz:text-sm">{t('chat.webSearch')}</div>
          {webSearchSupported ? null : (
            <div className="sz:text-xs sz:text-gray-500">{t('chat.webSearchNotSupported')}</div>
          )}
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
      <div className="sz:flex sz:flex-col sz:gap-2 sz:px-2 sz:py-1.5">
        <div className="sz:flex sz:items-center sz:gap-2">
          <RobotOutlined className="sz:shrink-0" />
          <span className="sz:text-sm">{t('settings.chatModel')}</span>
        </div>
        <Select
          size="small"
          aria-label={t('settings.chatModel')}
          value={chatModelOptions.some(({ value }) => value === chatModel) ? chatModel : undefined}
          placeholder={t('settings.chatModel')}
          options={chatModelOptions.map(({ value, label }) => ({ value, label, className: 'sz:font-ycom' }))}
          onChange={onChatModel}
          className="sz:w-full sz:font-ycom"
        />
      </div>
      <div
        className={`sz:flex sz:flex-col sz:gap-2 sz:px-2 sz:py-1.5 ${
          reasoningSupported ? '' : 'sz:opacity-50'
        }`}
      >
        <div className="sz:flex sz:items-center sz:gap-2">
          <BulbOutlined className="sz:shrink-0" />
          <div className="sz:min-w-0 sz:flex-1">
            <div className="sz:flex sz:items-baseline sz:justify-between sz:gap-2">
              <span className="sz:text-sm">{t('chat.reasoningEffort')}</span>
              {reasoningSupported ? (
                <span className="sz:text-sm sz:text-sz-cyan">{t(`chat.reasoningEffort_${reasoningEffort}`)}</span>
              ) : null}
            </div>
            {reasoningSupported ? null : (
              <div className="sz:text-xs sz:text-gray-500">{t('chat.reasoningEffortNotSupported')}</div>
            )}
          </div>
        </div>
        {/* A slider: a dot for each of the model's efforts and a knob on the chosen one. */}
        <div
          role="radiogroup"
          aria-label={t('chat.reasoningEffort')}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
            if (!reasoningSupported || !step) return;
            e.preventDefault();
            const effort = effortStops[effortIndex + step];
            if (effort) onReasoningEffort(effort);
          }}
          className={`sz:p-0.5 sz:rounded-full ${theme == 'dark' ? 'sz:bg-white/10' : 'sz:bg-black/5'}`}
        >
          <div
            className={`sz:relative sz:flex sz:justify-between sz:touch-none ${
              reasoningSupported ? 'sz:cursor-pointer' : 'sz:cursor-not-allowed'
            }`}
            onPointerDown={(e) => reasoningSupported && pickEffortAt(e.currentTarget, e.clientX)}
            onPointerMove={(e) => reasoningSupported && e.buttons === 1 && pickEffortAt(e.currentTarget, e.clientX)}
          >
            <span
              aria-hidden
              className={`sz:absolute sz:top-0 sz:size-5 sz:rounded-full sz:shadow-sm sz:transition-[left] sz:duration-150 ${
                theme == 'dark' ? 'sz:bg-gray-100' : 'sz:bg-white sz:ring-1 sz:ring-black/10'
              }`}
              style={{ left: `calc((100% - 1.25rem) * ${effortStops.length > 1 ? effortIndex / (effortStops.length - 1) : 0})` }}
            />
            {effortStops.map((effort) => (
              <button
                key={effort}
                type="button"
                role="radio"
                aria-checked={effort === reasoningEffort}
                aria-label={t(`chat.reasoningEffort_${effort}`)}
                title={t(`chat.reasoningEffort_${effort}`)}
                disabled={!reasoningSupported}
                onClick={() => onReasoningEffort(effort)}
                className="sz:relative sz:size-5 sz:flex sz:items-center sz:justify-center sz:rounded-full sz:cursor-[inherit] sz:focus-visible:outline-2 sz:focus-visible:outline-sz-cyan"
              >
                <span className={`sz:size-1 sz:rounded-full ${theme == 'dark' ? 'sz:bg-white/30' : 'sz:bg-black/25'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="topRight" open={open} onOpenChange={setOpen}>
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
