import {
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import { changePanelOpened, getPanelOpened } from '@/entrypoints/background/states/sidepanel';
import { debugLog, errorLog } from '@/logs';
import { getChatModelService } from '@/services/chatModelService';

let currentWindowId: number | undefined;

const updateCurrentWindowId = () => {
  chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
    currentWindowId = currentWindow.id;
  });
};

export const openPanel = async (windowId: number | undefined) => {
  if (windowId === undefined) {
    windowId = currentWindowId;
  }
  chrome.sidePanel.open({ windowId: windowId! });
};

export const closePanel = () => {
  chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    chrome.sidePanel.setOptions({ enabled: true });
  });
};

export const changePanelShowStatus = () => {
  changePanelOpened(!getPanelOpened());

  if (getPanelOpened()) {
    void openPanel(undefined);
  } else {
    closePanel();
  }
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

  chrome.action.onClicked.addListener(() => {
    changePanelShowStatus();
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_LISTEN_PANEL_CLOSED_KEY) {
      port.onDisconnect.addListener(() => {
        changePanelOpened(false);
      });
    }
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-sidepanel') {
      debugLog('toggle-sidepanel command received');
      changePanelShowStatus();
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
      if (msg.action === MESSAGE_RUN_GRAPH_STREAM) {
        const { threadId } = msg;

        await getChatModelService().streamChat(threadId, port, abortController);
      } else if (msg.action === MESSAGE_RETRY_GRAPH_STREAM) {
        const { threadId, messageIdxToRetry } = msg;

        await getChatModelService().retryStreamChat(
          threadId,
          messageIdxToRetry,
          port,
          abortController
        );
      }
    });
  });
};
