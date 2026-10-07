import {
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import { debugLog, errorLog } from '@/logs';
import { getChatModelHandler } from '@/services/background/chatModelHandler';

let currentWindowId: number | undefined;

const updateCurrentWindowId = () => {
  chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
    currentWindowId = currentWindow.id;
  });
};

// Callers pass the window of the tab that asked when they know it: right after the service worker
// starts, currentWindowId is still being looked up.
export const openPanel = (windowId: number | undefined) => {
  windowId ??= currentWindowId;
  if (windowId === undefined) return;
  // A no-op when the panel is already open.
  chrome.sidePanel.open({ windowId }).catch((error) => errorLog('sidePanel.open', error));
};

export const closePanel = () => {
  chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    chrome.sidePanel.setOptions({ enabled: true });
  });
};

// Asks Chrome whether the panel is open instead of remembering it: the service worker is stopped
// after ~30 s idle, and a remembered state came back as "closed" while the panel was open, so the
// next press opened (a no-op) instead of closing. open() has to run within the click or shortcut,
// which an await would leave, so the panel is opened right away and closed once the answer (taken
// before the open) says it had been open. Side panel contexts carry no window ID (-1), so this asks
// about any window, like closePanel, which closes them all.
export const togglePanel = (windowId: number | undefined) => {
  const wasOpen = chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.SIDE_PANEL] })
    .then((contexts) => contexts.length > 0);
  openPanel(windowId);
  wasOpen.then((open) => open && closePanel()).catch((error) => errorLog('getContexts', error));
};

export const sidebarToggleListeners = () => {
  if (typeof chrome.sidePanel === 'undefined') return;

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

  chrome.action.onClicked.addListener((tab) => {
    togglePanel(tab.windowId);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-sidepanel') {
      debugLog('toggle-sidepanel command received');
      togglePanel(tab?.windowId);
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

    port.onMessage.addListener(async (msg) => {
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
