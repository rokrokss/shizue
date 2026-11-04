import { MESSAGE_AGENT_STOP } from '@/config/constants';
import type { Language } from '@/hooks/language';
import {
  actionResult,
  AgentAction,
  AgentLabels,
  AgentOutcome,
  AgentRun,
  AgentStep,
  BROWSER_AGENT_MAX_STEPS,
  elementLabel,
  formatSnapshot,
  needsApproval,
  PageSnapshot,
  parseAgentReply,
} from '@/lib/browserAgent';
import { performAction, showAgentOverlay, snapshotPage } from '@/lib/browserAgentPage';
import { db } from '@/lib/indexDB';
import { getModelInstance, isLocalModel, ModelOptions, ModelPreset } from '@/lib/models';
import { BROWSER_AGENT_JSON_SCHEMA, getBrowserAgentPrompt } from '@/lib/prompts';
import { trackTokenUsage } from '@/lib/tokenUsageTracker';
import { debugLog, errorLog } from '@/logs';
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

// The browser agent's loop (lib/browserAgent.ts) for one answer: read the tab, ask the chat model
// for an action, wait for the user's go-ahead when it commits to something, do it, and read the
// tab again, until the model finishes. The panel follows the run through the answer's port as
// `{agent: AgentRun}`, and answers an approval card back over the same port.

// The page's text the model reads each turn; older pages are cut to their address.
const PAGE_TEXT_CHARS = 5000;
const LEFT_OUT = '(page details left out)';
const SETTLE_TIMEOUT_MS = 10_000;

const approvals = new Map<string, (approved: boolean) => void>();
const runs = new Map<number, AbortController>();

// The panel's answer to an approval card.
export const answerAgentApproval = (stepId: string, approved: boolean) => {
  approvals.get(stepId)?.(approved);
  approvals.delete(stepId);
};

// The stop button on the agent's pill in the page.
export const stopAgentInTab = (tabId: number | undefined) => {
  if (tabId !== undefined) runs.get(tabId)?.abort();
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

// The tab the user is looking at, beside the panel.
const activeWebTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id !== undefined && /^https?:/.test(tab.url ?? '') ? (tab as chrome.tabs.Tab & { id: number }) : null;
};

const snapshotOf = async (tabId: number): Promise<PageSnapshot | null> => {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: snapshotPage,
      args: [PAGE_TEXT_CHARS],
    });
    return (injection?.result as PageSnapshot | undefined) ?? null;
  } catch (error) {
    debugLog('Browser agent: snapshot failed', error);
    return null;
  }
};

const overlay = async (tabId: number, labels: AgentLabels | undefined, waitingNow: boolean | null) => {
  if (!labels && waitingNow !== null) return;
  await chrome.scripting
    .executeScript({
      target: { tabId, frameIds: [0] },
      func: showAgentOverlay,
      args: [waitingNow === null || !labels ? null : { ...labels, stopAction: MESSAGE_AGENT_STOP, waitingNow }],
    })
    .catch(() => {});
};

// Until the tab has loaded what the action started, if anything.
const settle = async (tabId: number, signal: AbortSignal) => {
  await sleep(400, signal);
  const until = Date.now() + SETTLE_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < until) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || tab.status === 'complete') break;
    await sleep(250, signal);
  }
  await sleep(300, signal);
};

const execute = async (tabId: number, action: AgentAction): Promise<Pick<AgentStep, 'status' | 'error'>> => {
  try {
    if (action.kind === 'navigate') {
      await chrome.tabs.update(tabId, { url: action.url! });
      return { status: 'done' };
    }
    if (action.kind === 'back') {
      await chrome.tabs.goBack(tabId);
      return { status: 'done' };
    }
    if (action.kind === 'wait') {
      await sleep(1500);
      return { status: 'done' };
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: performAction,
      args: [action],
    });
    const result = injection?.result as { ok: boolean; error?: AgentStep['error'] } | undefined;
    if (!result) return { status: 'failed', error: 'failed' };
    return result.ok ? { status: 'done' } : { status: 'failed', error: result.error ?? 'failed' };
  } catch (error) {
    debugLog('Browser agent: action failed', error);
    return { status: 'failed', error: 'unreachable' };
  }
};

// The conversation the model reads: earlier pages keep only their address, so the request
// doesn't grow with every turn.
const forgetOlderPages = (messages: BaseMessage[]) => {
  const pageTurns = messages.filter((m) => m instanceof HumanMessage && typeof m.content === 'string' && m.content.includes('\nURL: '));
  for (const turn of pageTurns.slice(0, -1)) {
    const text = turn.content as string;
    if (text.endsWith(LEFT_OUT)) continue;
    const start = text.indexOf('\nURL: ');
    const end = text.indexOf('\n', start + 1);
    turn.content = `${text.slice(0, start)}\n${text.slice(start + 1, end === -1 ? undefined : end)} ${LEFT_OUT}`;
  }
};

const askModel = async (
  modelPreset: ModelPreset,
  messages: BaseMessage[],
  signal: AbortSignal,
  reasoningEffort?: ModelOptions['reasoningEffort']
) => {
  const local = isLocalModel(modelPreset.modelName);
  const llm = getModelInstance({
    temperature: 0.2,
    // Room for a reasoning model's thinking before its JSON.
    maxTokens: 4000,
    streaming: local,
    reasoningEffort,
    modelPreset,
    jsonSchema: BROWSER_AGENT_JSON_SCHEMA,
  });
  let response: AIMessage | AIMessageChunk | undefined;
  if (local) {
    for await (const chunk of await llm.stream(messages, { signal })) {
      response = response ? (response as AIMessageChunk).concat(chunk) : chunk;
    }
  } else {
    response = await llm.invoke(messages, { signal });
  }
  if (!response) return '';
  await trackTokenUsage(modelPreset, response);
  return response.text;
};

export async function runBrowserAgent({
  messageId,
  task,
  history,
  lang,
  labels,
  autoApprove,
  reasoningEffort,
  modelPreset,
  port,
  signal: panelSignal,
}: {
  messageId: string;
  task: string;
  // The chat before the task, as the model reads it.
  history: BaseMessage[];
  lang: Language;
  labels?: AgentLabels;
  // Act without the approval card (a password or card field is still refused).
  autoApprove?: boolean;
  reasoningEffort?: ModelOptions['reasoningEffort'];
  modelPreset: ModelPreset;
  port: chrome.runtime.Port;
  signal: AbortSignal;
}) {
  const run: AgentRun = { steps: [] };
  const publish = () => {
    try {
      port.postMessage({ agent: run });
    } catch {
      // The panel went away; the run stops with its signal.
    }
    db.messages.update(messageId, { agentRun: structuredClone(run) }).catch((err) => {
      errorLog('Failed to save the browser agent run:', err);
    });
  };
  const end = (outcome: AgentOutcome) => {
    run.outcome = outcome;
    publish();
  };

  const tab = await activeWebTab();
  if (!tab) return end('unavailable');
  let tabId = tab.id;
  run.host = new URL(tab.url!).host;

  const controller = new AbortController();
  const signal = controller.signal;
  panelSignal.addEventListener('abort', () => controller.abort(), { once: true });
  if (panelSignal.aborted) controller.abort();
  runs.set(tabId, controller);
  // A link that opens in a new tab: the agent follows it there.
  let openedTabId: number | null = null;
  const onCreated = (created: chrome.tabs.Tab) => {
    if (created.openerTabId === tabId && created.id !== undefined) openedTabId = created.id;
  };
  chrome.tabs.onCreated.addListener(onCreated);

  try {
    let snapshot = await snapshotOf(tabId);
    if (!snapshot) return end('unavailable');
    await overlay(tabId, labels, false);
    publish();

    const messages: BaseMessage[] = [
      new SystemMessage(getBrowserAgentPrompt(lang)),
      ...history,
      new HumanMessage(`Task: ${task}\n\nThe page now:\n${formatSnapshot(snapshot)}`),
    ];
    let unreadable = 0;
    for (let turn = 0; turn < BROWSER_AGENT_MAX_STEPS; turn++) {
      if (signal.aborted) return end('stopped');
      const answer = await askModel(modelPreset, messages, signal, reasoningEffort);
      if (signal.aborted) return end('stopped');
      const reply = parseAgentReply(answer);
      if (!reply) {
        // A reply that isn't the JSON asked for gets two more chances.
        if (++unreadable > 2) return end('failed');
        messages.push(new AIMessage(answer || ' '), new HumanMessage('Answer with only the JSON object described, one action.'));
        continue;
      }
      unreadable = 0;
      messages.push(new AIMessage(JSON.stringify({ thought: reply.thought, ...reply.action, sensitive: reply.sensitive })));

      const { action } = reply;
      if (action.kind === 'finish') {
        const content = action.text ?? '';
        if (content) {
          port.postMessage({ delta: content });
          await db.messages.update(messageId, { content });
        }
        return end('finished');
      }

      const element = action.ref !== undefined ? snapshot.elements.find((e) => e.ref === action.ref) : undefined;
      const step: AgentStep = {
        id: crypto.randomUUID(),
        action,
        target: elementLabel(element),
        ...(reply.thought ? { thought: reply.thought } : {}),
        status: 'running',
      };
      run.steps.push(step);
      if (action.ref !== undefined && !element) {
        Object.assign(step, { status: 'failed', error: 'not_found' });
      } else if (action.kind === 'type' && element?.secret) {
        Object.assign(step, { status: 'failed', error: 'secret_field' });
      } else if (needsApproval(action, element, reply.sensitive) && autoApprove) {
        step.autoApproved = true;
      } else if (needsApproval(action, element, reply.sensitive)) {
        Object.assign(step, { status: 'awaiting', approval: true });
        publish();
        await overlay(tabId, labels, true);
        const approved = await new Promise<boolean>((resolve) => {
          approvals.set(step.id, resolve);
          signal.addEventListener('abort', () => resolve(false), { once: true });
        });
        approvals.delete(step.id);
        if (signal.aborted) {
          step.status = 'denied';
          return end('stopped');
        }
        await overlay(tabId, labels, false);
        step.status = approved ? 'running' : 'denied';
      }
      publish();

      if (step.status === 'running') {
        openedTabId = null;
        Object.assign(step, await execute(tabId, action));
        publish();
        await settle(tabId, signal);
        if (openedTabId !== null) {
          await overlay(tabId, labels, null);
          runs.delete(tabId);
          tabId = openedTabId;
          runs.set(tabId, controller);
          await settle(tabId, signal);
          const opened = await chrome.tabs.get(tabId).catch(() => null);
          if (opened?.url) run.host = new URL(opened.url).host;
        }
      }
      if (signal.aborted) return end('stopped');

      // A page that is still being replaced has nothing to read for a moment.
      snapshot = (await snapshotOf(tabId)) ?? (await sleep(1000, signal), await snapshotOf(tabId));
      if (!snapshot) return end('unavailable');
      await overlay(tabId, labels, false);
      forgetOlderPages(messages);
      messages.push(new HumanMessage(`${actionResult(step)}\n\nThe page now:\n${formatSnapshot(snapshot)}`));
    }
    return end('max_steps');
  } catch (error) {
    if (signal.aborted) return end('stopped');
    throw error;
  } finally {
    chrome.tabs.onCreated.removeListener(onCreated);
    runs.delete(tabId);
    for (const step of run.steps) approvals.delete(step.id);
    await overlay(tabId, labels, null);
  }
}
