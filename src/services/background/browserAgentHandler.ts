import { MESSAGE_AGENT_STOP } from '@/config/constants';
import type { Language } from '@/hooks/language';
import {
  actionResult,
  actionSignature,
  AgentAction,
  AgentLabels,
  AgentOutcome,
  AgentRun,
  AgentStep,
  AgentTab,
  BROWSER_AGENT_MAX_STEPS,
  elementLabel,
  formatSnapshot,
  needsApproval,
  PageElement,
  PageSnapshot,
  parseAgentReply,
  timesTried,
  WebMcpTool,
  withFrames,
} from '@/lib/browserAgent';
import {
  clickAt,
  markElements,
  performAction,
  readWebMcpTools,
  runWebMcpTool,
  showAgentOverlay,
  snapshotPage,
} from '@/lib/browserAgentPage';
import { formatImageForProvider } from '@/lib/imageFormatHelper';
import { db } from '@/lib/indexDB';
import { BASE_REASONING_EFFORTS, chunkParts, effortWithin } from '@/lib/reasoning';
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
// A question waits this long for the user's answer.
const ASK_TIMEOUT_MS = 5 * 60_000;
// Screenshots are at most this wide, in pixels, to keep their tokens down.
const SHOT_WIDTH = 1280;
const TOOL_OUTPUT_CHARS = 4000;

// What the user typed while a run worked, by the answer's port: the next turn reads it, and a
// question waiting takes it as its answer.
type Steering = { said: string[]; wake?: () => void };
const steering = new Map<chrome.runtime.Port, Steering>();

// Text the user sent from the chat box while the agent works on this port's answer.
export const steerAgent = (port: chrome.runtime.Port, text: string) => {
  const run = steering.get(port);
  if (!run || !text.trim()) return;
  run.said.push(text.trim());
  run.wake?.();
};

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

// The tools the page and its frames registered with WebMCP; none on most pages, and in Firefox.
const webMcpToolsOf = async (tabId: number): Promise<WebMcpTool[]> => {
  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: readWebMcpTools,
    });
    const seen = new Set<string>();
    return injections
      .sort((a, b) => a.frameId - b.frameId)
      .flatMap((injection) =>
        ((injection.result as Omit<WebMcpTool, 'frameId'>[] | undefined) ?? []).map((tool) => ({
          ...tool,
          frameId: injection.frameId,
        }))
      )
      .filter((tool) => !seen.has(tool.name) && (seen.add(tool.name), true));
  } catch {
    return [];
  }
};

// The page and its frames (a form or a document embedded from elsewhere), read together, with the
// tools the site offers.
const snapshotOf = async (tabId: number): Promise<PageSnapshot | null> => {
  const read = (target: chrome.scripting.InjectionTarget) =>
    chrome.scripting.executeScript({ target, func: snapshotPage, args: [PAGE_TEXT_CHARS] });
  try {
    // A frame that can't be read leaves the page itself.
    const [injections, tools] = await Promise.all([
      read({ tabId, allFrames: true }).catch(() => read({ tabId, frameIds: [0] })),
      webMcpToolsOf(tabId),
    ]);
    const page = injections.find((injection) => injection.frameId === 0)?.result as PageSnapshot | undefined;
    if (!page) return null;
    const frames = injections
      .filter((injection) => injection.frameId !== 0 && injection.result)
      .sort((a, b) => a.frameId - b.frameId)
      .map((injection) => ({ frameId: injection.frameId, snapshot: injection.result as PageSnapshot }));
    return { ...withFrames(page, frames), ...(tools.length ? { tools } : {}) };
  } catch (error) {
    debugLog('Browser agent: snapshot failed', error);
    return null;
  }
};

const toDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
};

// The tab on screen as a JPEG, its controls marked with their numbers, at most SHOT_WIDTH wide.
// `scale` turns the image's pixels back into the page's. Only the tab showing can be captured.
const screenshot = async (tabId: number): Promise<{ dataUrl: string; scale: number; width: number; height: number } | null> => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active || tab.windowId === undefined) return null;
  const mark = async (on: boolean) =>
    (await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: markElements, args: [on] }))[0]
      ?.result as { width: number; height: number } | undefined;
  try {
    const viewport = await mark(true);
    if (!viewport) return null;
    const captured = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
    await mark(false);
    const scale = Math.min(1, SHOT_WIDTH / viewport.width);
    const width = Math.round(viewport.width * scale);
    const height = Math.round(viewport.height * scale);
    const bitmap = await createImageBitmap(await (await fetch(captured)).blob());
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = await toDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }));
    return { dataUrl, scale, width, height };
  } catch (error) {
    debugLog('Browser agent: screenshot failed', error);
    await mark(false).catch(() => undefined);
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

// The action, in the frame its element is in. Tabs, screenshots and the site's tools are the
// loop's own (runBrowserAgent).
const execute = async (
  tabId: number,
  action: AgentAction,
  element: PageElement | undefined
): Promise<Pick<AgentStep, 'status' | 'error'>> => {
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
      target: { tabId, frameIds: [element?.frameId ?? 0] },
      func: performAction,
      args: [element?.frameRef !== undefined ? { ...action, ref: element.frameRef } : action],
    });
    const result = injection?.result as { ok: boolean; error?: AgentStep['error'] } | undefined;
    if (!result) return { status: 'failed', error: 'failed' };
    return result.ok ? { status: 'done' } : { status: 'failed', error: result.error ?? 'failed' };
  } catch (error) {
    debugLog('Browser agent: action failed', error);
    // A frame that went away since the page was read.
    return { status: 'failed', error: element?.frameId ? 'not_found' : 'unreachable' };
  }
};

const SHOT_LEFT_OUT = '(screenshot left out)';

// The conversation the model reads: earlier pages keep only their address, and earlier
// screenshots go, so the request doesn't grow with every turn.
const forgetOlderPages = (messages: BaseMessage[]) => {
  for (const message of messages) {
    if (!(message instanceof HumanMessage) || typeof message.content === 'string') continue;
    if (message.content.every((part) => part.type === 'text')) continue;
    const text = message.content
      .map((part) => (part.type === 'text' ? (part as { text: string }).text : ''))
      .join('\n');
    message.content = `${text}\n${SHOT_LEFT_OUT}`;
  }
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
  // Each step is one small choice, made up to 100 times: High at most. A model that thinks first
  // gets the room the chat gives its thinking (lib/models.ts); the JSON alone fits in 4000.
  const effort = reasoningEffort && effortWithin(reasoningEffort, BASE_REASONING_EFFORTS);
  const thinks = effort !== undefined && effort !== 'low';
  const llm = getModelInstance({
    temperature: 0.2,
    ...(thinks ? {} : { maxTokens: 4000 }),
    streaming: local,
    reasoningEffort: effort,
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
  // Without the thinking a model may send along (Gemini's thoughts are text too), whose braces
  // would spoil the JSON.
  return chunkParts(response).text;
};

// The latest turn is the user's (the page now); what the user adds goes with it, since providers
// want the turns to alternate.
const addToLastTurn = (messages: BaseMessage[], text: string) => {
  const last = messages[messages.length - 1];
  if (!(last instanceof HumanMessage)) {
    messages.push(new HumanMessage(text));
  } else if (typeof last.content === 'string') {
    last.content = `${last.content}\n\n${text}`;
  } else {
    last.content = [...last.content, { type: 'text', text }];
  }
};

// The user's next words from the chat box, or null once `ms` pass or the run stops. The worker is
// kept awake meanwhile: Chrome stops one 30 s after its last extension call.
const nextSaid = (run: Steering, ms: number, signal: AbortSignal) =>
  new Promise<string | null>((resolve) => {
    if (run.said.length) return resolve(run.said.shift()!);
    const awake = setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
    const timer = setTimeout(() => finish(null), ms);
    const finish = (text: string | null) => {
      clearTimeout(timer);
      clearInterval(awake);
      run.wake = undefined;
      resolve(text);
    };
    run.wake = () => finish(run.said.shift() ?? null);
    signal.addEventListener('abort', () => finish(null), { once: true });
  });

export async function runBrowserAgent({
  messageId,
  task,
  history,
  lang,
  labels,
  autoApprove,
  reasoningEffort,
  modelPreset,
  canSee,
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
  // The model reads images, so it may look at the tab.
  canSee: boolean;
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
  const said: Steering = { said: [] };
  steering.set(port, said);
  // The tabs the agent works in, by their number: the first, those it opened, and those a link
  // opened (it follows a link that opens in a new tab there).
  const tabs = [tabId];
  let openedTabId: number | null = null;
  const onCreated = (created: chrome.tabs.Tab) => {
    if (created.openerTabId === tabId && created.id !== undefined) openedTabId = created.id;
  };
  chrome.tabs.onCreated.addListener(onCreated);
  const moveTo = async (next: number) => {
    await overlay(tabId, labels, null);
    runs.delete(tabId);
    tabId = next;
    runs.set(tabId, controller);
    if (!tabs.includes(next)) tabs.push(next);
    await settle(tabId, signal);
    const moved = await chrome.tabs.get(tabId).catch(() => null);
    if (moved?.url) run.host = new URL(moved.url).host;
  };
  const tabList = async (): Promise<AgentTab[]> => {
    if (tabs.length < 2) return [];
    const found = await Promise.all(tabs.map((id) => chrome.tabs.get(id).catch(() => null)));
    return found.flatMap((open, index) =>
      open ? [{ number: index + 1, title: open.title ?? '', url: open.url ?? '', current: tabs[index] === tabId }] : []
    );
  };
  const read = async () => {
    const page = await snapshotOf(tabId);
    return page && { ...page, tabs: await tabList() };
  };
  // The last screenshot's scale, for a click at one of its points.
  let shotScale: number | null = null;
  // What was done, by actionSignature, and whether the agent was told it repeats itself.
  const tried: string[] = [];
  let warned = false;

  try {
    let snapshot = await read();
    if (!snapshot) return end('unavailable');
    await overlay(tabId, labels, false);
    publish();

    const messages: BaseMessage[] = [
      new SystemMessage(getBrowserAgentPrompt(lang, canSee)),
      ...history,
      new HumanMessage(`Task: ${task}\n\nThe page now:\n${formatSnapshot(snapshot)}`),
    ];
    let unreadable = 0;
    for (let turn = 0; turn < BROWSER_AGENT_MAX_STEPS; turn++) {
      if (signal.aborted) return end('stopped');
      // What the user typed meanwhile, for this turn on.
      const added = said.said.splice(0);
      for (const text of added) {
        run.steps.push({ id: crypto.randomUUID(), action: { kind: 'steer', text }, status: 'done' });
        addToLastTurn(messages, `The user adds, while you work: ${JSON.stringify(text)}`);
      }
      if (added.length) publish();

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
      const tool = action.kind === 'tool' ? snapshot.tools?.find((t) => t.name === action.name) : undefined;
      const step: AgentStep = {
        id: crypto.randomUUID(),
        action,
        target: action.kind === 'tool' ? action.name : elementLabel(element),
        ...(reply.thought ? { thought: reply.thought } : {}),
        status: 'running',
      };
      run.steps.push(step);

      // A question: the run waits for the answer from the chat box.
      if (action.kind === 'ask') {
        step.status = 'awaiting';
        publish();
        await overlay(tabId, labels && { ...labels, waiting: labels.asking }, true);
        const answered = await nextSaid(said, ASK_TIMEOUT_MS, signal);
        if (signal.aborted) return end('stopped');
        if (answered === null) {
          step.status = 'denied';
          return end('unanswered');
        }
        Object.assign(step, { status: 'done', reply: answered });
        publish();
        await overlay(tabId, labels, false);
        snapshot = (await read()) ?? snapshot;
        messages.push(new HumanMessage(`The user answers: ${JSON.stringify(answered)}\n\nThe page now:\n${formatSnapshot(snapshot)}`));
        continue;
      }

      // The same action on a page that didn't change, a third time: it is told once, then stopped.
      const signature = actionSignature(action, snapshot);
      const repeated = timesTried(tried, signature) >= 2;
      tried.push(signature);
      if (repeated && warned) {
        Object.assign(step, { status: 'failed', error: 'repeated' });
        return end('looping');
      }

      if (repeated) {
        warned = true;
        Object.assign(step, { status: 'failed', error: 'repeated' });
      } else if (action.ref !== undefined && !element) {
        Object.assign(step, { status: 'failed', error: 'not_found' });
      } else if (action.kind === 'type' && element?.secret) {
        Object.assign(step, { status: 'failed', error: 'secret_field' });
      } else if (action.kind === 'tool' && !tool) {
        Object.assign(step, { status: 'failed', error: 'no_tool' });
      } else if (action.kind === 'switch_tab' && !tabs[action.tab! - 1]) {
        Object.assign(step, { status: 'failed', error: 'no_tab' });
      } else if (action.kind === 'click_at' && shotScale === null) {
        Object.assign(step, { status: 'failed', error: 'no_screenshot' });
      } else if ((action.kind === 'look' || action.kind === 'click_at') && !canSee) {
        Object.assign(step, { status: 'failed', error: 'failed' });
      } else if (needsApproval(action, element, reply.sensitive, tool) && autoApprove) {
        step.autoApproved = true;
      } else if (needsApproval(action, element, reply.sensitive, tool)) {
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

      // What goes to the model with the page: a tool's output, a screenshot.
      let output = '';
      let shot: Awaited<ReturnType<typeof screenshot>> = null;
      if (step.status === 'running') {
        openedTabId = null;
        if (action.kind === 'look') {
          shot = await screenshot(tabId);
          shotScale = shot?.scale ?? shotScale;
          Object.assign(step, shot ? { status: 'done' } : { status: 'failed', error: 'not_visible' });
        } else if (action.kind === 'click_at') {
          const visible = (await chrome.tabs.get(tabId).catch(() => null))?.active;
          const [injection] = visible
            ? await chrome.scripting
                .executeScript({
                  target: { tabId, frameIds: [0] },
                  func: clickAt,
                  args: [{ x: action.x! / shotScale!, y: action.y! / shotScale! }],
                })
                .catch(() => [])
            : [];
          const result = injection?.result as { ok: boolean; error?: AgentStep['error'] } | undefined;
          Object.assign(
            step,
            !visible
              ? { status: 'failed', error: 'not_visible' }
              : result?.ok
                ? { status: 'done' }
                : { status: 'failed', error: result?.error ?? 'failed' }
          );
        } else if (action.kind === 'open_tab') {
          const opened = await chrome.tabs.create({ url: action.url!, openerTabId: tabId, active: true }).catch(() => null);
          if (opened?.id === undefined) {
            Object.assign(step, { status: 'failed', error: 'unreachable' });
          } else {
            openedTabId = null;
            await moveTo(opened.id);
            step.status = 'done';
          }
        } else if (action.kind === 'switch_tab') {
          const next = tabs[action.tab! - 1];
          const shown = await chrome.tabs.update(next, { active: true }).catch(() => null);
          if (!shown) {
            Object.assign(step, { status: 'failed', error: 'no_tab' });
          } else {
            await moveTo(next);
            step.status = 'done';
          }
        } else if (action.kind === 'tool') {
          const [injection] = await chrome.scripting
            .executeScript({
              target: { tabId, frameIds: [tool!.frameId] },
              world: 'MAIN',
              func: runWebMcpTool,
              args: [tool!.name, JSON.stringify(action.input ?? {})],
            })
            .catch(() => []);
          const result = injection?.result as { ok: boolean; output?: string; error?: string } | undefined;
          if (result?.ok) {
            step.status = 'done';
            output = `Tool output:\n${(result.output ?? '').slice(0, TOOL_OUTPUT_CHARS)}`;
          } else {
            Object.assign(step, { status: 'failed', error: result?.error === 'no_tool' ? 'no_tool' : 'failed' });
            if (result?.error && result.error !== 'no_tool') output = `Tool error: ${result.error}`;
          }
        } else {
          Object.assign(step, await execute(tabId, action, element));
        }
        publish();
        if (action.kind !== 'look') await settle(tabId, signal);
        if (openedTabId !== null) await moveTo(openedTabId);
      }
      if (signal.aborted) return end('stopped');

      // A page that is still being replaced has nothing to read for a moment.
      snapshot = (await read()) ?? (await sleep(1000, signal), await read());
      if (!snapshot) return end('unavailable');
      await overlay(tabId, labels, false);
      forgetOlderPages(messages);
      const result = [actionResult(step), output].filter(Boolean).join('\n');
      const text = `${result}${
        shot ? `\nThe screenshot (${shot.width}x${shot.height} px) is attached.` : ''
      }\n\nThe page now:\n${formatSnapshot(snapshot)}`;
      messages.push(
        new HumanMessage(
          shot
            ? {
                content: [
                  { type: 'text', text },
                  formatImageForProvider(shot.dataUrl, modelPreset.modelName, modelPreset.connectionMode),
                ],
              }
            : text
        )
      );
    }
    return end('max_steps');
  } catch (error) {
    if (signal.aborted) return end('stopped');
    throw error;
  } finally {
    chrome.tabs.onCreated.removeListener(onCreated);
    steering.delete(port);
    runs.delete(tabId);
    for (const step of run.steps) approvals.delete(step.id);
    await overlay(tabId, labels, null);
  }
}
