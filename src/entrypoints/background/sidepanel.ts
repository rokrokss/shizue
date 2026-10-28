import {
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_STREAM_MESSAGE,
  STORAGE_PANEL_SOURCE_TAB,
  STORAGE_PANEL_TAB,
} from '@/config/constants';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import { debugLog, errorLog } from '@/logs';
import { getChatModelHandler } from '@/services/background/chatModelHandler';

// Firefox's sidebar (desktop only). Not in Chrome's types.
type SidebarAction = {
  open(): Promise<void>;
  toggle(): Promise<void>;
  isOpen(details: { windowId?: number }): Promise<boolean>;
};
const sidebarAction = (globalThis as { browser?: { sidebarAction?: SidebarAction } }).browser
  ?.sidebarAction;

// Where the panel page is shown. Firefox shows it in its sidebar, beside the page. Safari and
// every Android browser have neither, so they show it in a tab. Edge for Android has a
// chrome.sidePanel whose open() does nothing, and setPanelBehavior({ openPanelOnActionClick })
// leaves its toolbar button dead, so Android is ruled out by the user agent, which (unlike
// getPlatformInfo) is known synchronously.
export const panelHost: 'sidePanel' | 'sidebar' | 'tab' =
  typeof chrome.sidePanel !== 'undefined' && !/Android/i.test(navigator.userAgent)
    ? 'sidePanel'
    : sidebarAction
      ? 'sidebar'
      : 'tab';

// Brings the panel tab forward, or creates it, and remembers the page it was opened from: in a
// tab, the active tab is the panel itself, so the panel asks for this one instead.
export const openPanelTab = async (sourceTabId?: number) => {
  const { [STORAGE_PANEL_TAB]: panelTabId } = await chrome.storage.session.get(STORAGE_PANEL_TAB);
  if (sourceTabId !== undefined && sourceTabId !== panelTabId) {
    await chrome.storage.session.set({ [STORAGE_PANEL_SOURCE_TAB]: sourceTabId });
  }
  const pageUrl = chrome.runtime.getURL('/sidepanel.html');
  if (typeof panelTabId === 'number') {
    const tab = await chrome.tabs.get(panelTabId).catch(() => undefined);
    // url is missing where the browser doesn't expose it; a navigated-away tab is not reused.
    if (tab && (tab.url === undefined || tab.url.startsWith(pageUrl))) {
      await chrome.tabs.update(panelTabId, { active: true });
      if (tab.windowId !== undefined) await chrome.windows?.update(tab.windowId, { focused: true });
      return;
    }
  }
  const tab = await chrome.tabs.create({ url: `${pageUrl}?host=tab` });
  await chrome.storage.session.set({ [STORAGE_PANEL_TAB]: tab.id });
};

// Firefox opens and closes its sidebar only within a user action: the toolbar button, a shortcut,
// a menu click. A request from the page may come without one; then a sidebar already open is used
// as it is, and a closed one gives way to the panel tab.
const showSidebar = (
  change: Promise<void>,
  windowId: number | undefined,
  sourceTabId: number | undefined
) =>
  change.catch(async () => {
    if (!(await sidebarAction!.isOpen({ windowId }))) await openPanelTab(sourceTabId);
  });

let currentWindowId: number | undefined;

const updateCurrentWindowId = () => {
  chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
    currentWindowId = currentWindow.id;
  });
};

// Callers pass the window of the tab that asked when they know it: right after the service worker
// starts, currentWindowId is still being looked up. The tab itself is what a panel tab works on.
export const openPanel = (windowId: number | undefined, sourceTabId?: number) => {
  if (panelHost === 'tab') return openPanelTab(sourceTabId);
  if (panelHost === 'sidebar') return showSidebar(sidebarAction!.open(), windowId, sourceTabId);
  windowId ??= currentWindowId;
  if (windowId === undefined) return Promise.reject(new Error('No window available for the side panel.'));
  // A no-op when the panel is already open.
  return chrome.sidePanel.open({ windowId });
};

export const closePanel = () => {
  return chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    return chrome.sidePanel.setOptions({ enabled: true });
  });
};

// Asks Chrome whether the panel is open instead of remembering it: the service worker is stopped
// after ~30 s idle, and a remembered state came back as "closed" while the panel was open, so the
// next press opened (a no-op) instead of closing. open() has to run within the click or shortcut,
// which an await would leave, so the panel is opened right away and closed once the answer (taken
// before the open) says it had been open. Side panel contexts carry no window ID (-1), so this asks
// about any window, like closePanel, which closes them all.
// A panel tab hides the page, so from the page the toggle only ever opens it.
export const togglePanel = (windowId: number | undefined, sourceTabId?: number) => {
  if (panelHost === 'tab') return openPanelTab(sourceTabId);
  if (panelHost === 'sidebar') return showSidebar(sidebarAction!.toggle(), windowId, sourceTabId);
  const wasOpen = chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] })
    .then((contexts) => contexts.length > 0);
  const opened = openPanel(windowId);
  return Promise.all([wasOpen, opened]).then(([open]) => { if (open) return closePanel(); });
};

export const sidebarToggleListeners = () => {
  if (panelHost !== 'sidePanel') {
    // Both are user actions, so Firefox's sidebar opens or closes right away.
    const open = (tab?: chrome.tabs.Tab) =>
      void (panelHost === 'sidebar' ? sidebarAction!.toggle() : openPanelTab(tab?.id)).catch(
        (error) => errorLog('open panel', error)
      );
    chrome.action.onClicked.addListener(open);
    // Mobile browsers have no keyboard commands.
    chrome.commands?.onCommand.addListener((command, tab) => {
      if (command === 'toggle-sidepanel') open(tab);
    });
    chrome.tabs.onRemoved.addListener((tabId) => {
      void chrome.storage.session.get(STORAGE_PANEL_TAB).then(({ [STORAGE_PANEL_TAB]: panelTabId }) => {
        if (panelTabId === tabId) return chrome.storage.session.remove(STORAGE_PANEL_TAB);
      });
    });
    return;
  }

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => errorLog(error));

  updateCurrentWindowId();

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      currentWindowId = windowId;
    }
  });

  chrome.windows.onCreated.addListener(() => {
    updateCurrentWindowId();
  });

  chrome.windows.onRemoved.addListener(() => {
    updateCurrentWindowId();
  });

  // Chrome handles toolbar clicks through setPanelBehavior; toggling a second time
  // here could immediately close the panel Chrome just opened.

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-sidepanel') {
      debugLog('toggle-sidepanel command received');
      void togglePanel(tab?.windowId).catch((error) => errorLog('toggle-sidepanel', error));
    }
  });
};

export const sidePanelMessageListeners = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_STREAM_MESSAGE) return;

    const abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    // The panel opens a port for each answer. Safari delivers a message posted right after
    // connect twice (WebKit queues it until this end takes the port, then fires the queue once
    // per world), which ran the model twice into one reply, so only the first is answered.
    let answered = false;
    port.onMessage.addListener(async (msg) => {
      if (answered) return;
      answered = true;
      await whenBackgroundStateReady();
      if (msg.action === MESSAGE_RUN_GRAPH_STREAM) {
        const { threadId, actionType } = msg;

        await getChatModelHandler().streamChat(threadId, port, abortController, actionType);
      } else if (msg.action === MESSAGE_RETRY_GRAPH_STREAM) {
        const { threadId, messageIdxToRetry, actionType } = msg;

        await getChatModelHandler().retryStreamChat(
          threadId,
          messageIdxToRetry,
          port,
          abortController,
          actionType
        );
      }
    });
  });
};
