import { useThemeValue } from '@/hooks/layout';
import type { AgentRun, AgentStep } from '@/lib/browserAgent';
import {
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SelectOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import type { TFunction } from 'i18next';
import { type CSSProperties, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const clip = (text: string | undefined, max: number) => {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const hostOf = (url: string | undefined) => {
  try {
    return new URL(url ?? '').host;
  } catch {
    return url ?? '';
  }
};

// A step as a short sentence: "Clicked ‘Search’", "Typed “shoes” in ‘Search’".
export const agentStepLabel = (step: AgentStep, t: TFunction) => {
  const { action } = step;
  const target = clip(step.target, 40) || '…';
  const text = clip(action.text, 40);
  switch (action.kind) {
    case 'click':
      return t('agent.step.click', { target });
    case 'type':
      return t(action.submit ? 'agent.step.typeSubmit' : 'agent.step.type', { target, text });
    case 'select':
      return t('agent.step.select', { target, text });
    case 'scroll':
      return t(action.direction === 'up' ? 'agent.step.scrollUp' : 'agent.step.scrollDown');
    case 'navigate':
      return t('agent.step.navigate', { host: hostOf(action.url) });
    case 'back':
      return t('agent.step.back');
    default:
      return t('agent.step.wait');
  }
};

const StepIcon = ({ step }: { step: AgentStep }) => {
  const className = 'sz:text-[11px] sz:shrink-0 sz:mt-[3px]';
  switch (step.status) {
    case 'running':
      return <LoadingOutlined className={`${className} sz:text-sz-cyan`} />;
    case 'done':
      return <CheckOutlined className={`${className} sz:text-sz-cyan`} />;
    case 'failed':
      return <CloseOutlined className={`${className} sz:text-red-400`} />;
    case 'denied':
      return <StopOutlined className={`${className} sz:text-gray-400`} />;
    default:
      return <SafetyCertificateOutlined className={`${className} sz:text-amber-500`} />;
  }
};

// The browser agent's actions above its answer (lib/browserAgent.ts), like the model's thinking:
// open while it works, folded into "5 steps on example.com" once it is done. An action that sends,
// deletes or pays waits on a card here until the user allows or declines it.
const AgentRunBlock = ({
  run,
  live,
  onApproval,
}: {
  run: AgentRun;
  // The agent is still working on this answer.
  live: boolean;
  onApproval: (stepId: string, approved: boolean) => void;
}) => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const dark = theme == 'dark';
  const [open, setOpen] = useState(false);
  // The card answered, until the agent moves on.
  const [answered, setAnswered] = useState<string | null>(null);
  const awaiting = live ? run.steps.find((step) => step.status === 'awaiting') : undefined;
  useEffect(() => {
    if (!awaiting) setAnswered(null);
  }, [awaiting]);

  const host = run.host ?? '';
  const count = run.steps.length;
  const expanded = live || open;
  const label = live
    ? t('agent.working', { host })
    : count
    ? t('agent.stepsDone', { count, host })
    : t('agent.readPage', { host });
  const outcome = !live && run.outcome && run.outcome !== 'finished' ? run.outcome : null;

  const answer = (approved: boolean) => {
    if (!awaiting) return;
    setAnswered(awaiting.id);
    onApproval(awaiting.id, approved);
  };

  return (
    <div
      className="sz-agent-run sz:flex sz:flex-col sz:items-start sz:pb-2 sz:font-ycom"
      style={
        {
          '--sz-thinking-dim': dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
          '--sz-thinking-bright': dark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)',
        } as CSSProperties
      }
    >
      <button
        type="button"
        aria-expanded={expanded}
        disabled={live || count === 0}
        onClick={() => setOpen((value) => !value)}
        className={`sz:flex sz:items-center sz:gap-1.5 sz:text-xs sz:rounded-md sz:py-0.5 sz:pr-1.5 sz:-ml-0.5 sz:pl-0.5 sz:max-w-full ${
          live
            ? 'sz-thinking-live sz:cursor-default'
            : `sz:text-gray-500 ${count ? `sz:cursor-pointer ${dark ? 'sz:hover:text-gray-300' : 'sz:hover:text-gray-700'}` : 'sz:cursor-default'}`
        }`}
      >
        {count ? (
          <RightOutlined
            className={`sz:text-[9px] sz:transition-transform sz:duration-200 sz:motion-reduce:transition-none ${
              expanded ? 'sz:rotate-90' : ''
            }`}
          />
        ) : null}
        <SelectOutlined className={`sz:text-[11px] ${live ? 'sz:text-sz-cyan' : ''}`} />
        <span className="sz-thinking-label sz:truncate">{label}</span>
      </button>
      {count ? (
        <div
          className={`sz:grid sz:w-full sz:transition-[grid-template-rows,opacity] sz:duration-300 sz:ease-out sz:motion-reduce:transition-none ${
            expanded ? 'sz:grid-rows-[1fr] sz:opacity-100' : 'sz:grid-rows-[0fr] sz:opacity-0'
          }`}
        >
          <div className="sz:overflow-hidden">
            <ol
              className={`sz:mt-1 sz:ml-1 sz:pl-3 sz:border-l-2 sz:flex sz:flex-col sz:gap-1.5 sz:text-xs sz:leading-5 ${
                dark ? 'sz:border-white/15' : 'sz:border-black/10'
              }`}
            >
              {run.steps.map((step) => (
                <li key={step.id} className="sz:flex sz:items-start sz:gap-2 sz:animate-[sz-fade-in_0.25s_ease-out] sz:motion-reduce:animate-none">
                  <StepIcon step={step} />
                  <div className="sz:min-w-0 sz:flex-1">
                    <div
                      className={`sz:break-words ${
                        step.status === 'denied' ? 'sz:text-gray-500 sz:line-through' : dark ? 'sz:text-gray-200' : 'sz:text-gray-700'
                      }`}
                    >
                      {agentStepLabel(step, t)}
                    </div>
                    {step.autoApproved ? (
                      <div className="sz:text-[11px] sz:text-amber-500">{t('agent.autoApproved')}</div>
                    ) : null}
                    {step.status === 'failed' ? (
                      <div className="sz:text-[11px] sz:text-red-400">{t(`agent.error.${step.error ?? 'failed'}`)}</div>
                    ) : step.status === 'denied' ? (
                      <div className="sz:text-[11px] sz:text-gray-500">{t('agent.denied')}</div>
                    ) : step.thought ? (
                      <div className="sz:text-[11px] sz:text-gray-500 sz:break-words">{step.thought}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
      {awaiting ? (
        <div
          role="alertdialog"
          aria-labelledby={`sz-agent-approval-${awaiting.id}`}
          className={`sz:mt-2 sz:w-full sz:rounded-xl sz:border sz:p-3 sz:animate-[sz-fade-in_0.25s_ease-out] sz:motion-reduce:animate-none ${
            dark ? 'sz:border-amber-400/40 sz:bg-amber-400/10' : 'sz:border-amber-500/40 sz:bg-amber-50'
          }`}
        >
          <div
            id={`sz-agent-approval-${awaiting.id}`}
            className="sz:flex sz:items-center sz:gap-1.5 sz:text-[13px] sz:font-semibold"
          >
            <SafetyCertificateOutlined className="sz:text-amber-500" />
            {t('agent.approvalTitle')}
          </div>
          <div className={`sz:mt-1.5 sz:text-[13px] sz:break-words ${dark ? 'sz:text-gray-100' : 'sz:text-gray-800'}`}>
            {agentStepLabel(awaiting, t)}
          </div>
          <div className="sz:mt-0.5 sz:text-xs sz:text-gray-500 sz:break-words">
            {host ? `${host} · ` : ''}
            {t('agent.approvalHint')}
          </div>
          <div className="sz:flex sz:gap-2 sz:mt-2.5">
            <Button
              color="cyan"
              variant="solid"
              size="small"
              autoFocus
              disabled={answered === awaiting.id}
              onClick={() => answer(true)}
            >
              {t('agent.allow')}
            </Button>
            <Button size="small" disabled={answered === awaiting.id} onClick={() => answer(false)}>
              {t('agent.deny')}
            </Button>
          </div>
        </div>
      ) : null}
      {outcome ? (
        <div className="sz:flex sz:flex-row sz:items-start sz:gap-1 sz:text-xs sz:text-gray-500 sz:pt-1.5">
          <InfoCircleOutlined className="sz:pt-[2px]" />
          <span>{t(`agent.outcome.${outcome}`)}</span>
        </div>
      ) : null}
    </div>
  );
};

export default AgentRunBlock;
