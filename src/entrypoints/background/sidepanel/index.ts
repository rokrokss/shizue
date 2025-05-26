import {
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_RUN_GRAPH_STREAM,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import { loadUserMemory } from '@/hooks/userMemory';
import { debugLog, errorLog } from '@/logs';
import { loadThread } from '@/utils/indexDB';

let panelOpened = false;
let currentWindowId: number | undefined;

const updateCurrentWindowId = () => {
  chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
    currentWindowId = currentWindow.id;
  });
};

const openPanel = async (windowId: number | undefined) => {
  if (windowId === undefined) {
    windowId = currentWindowId;
  }
  chrome.sidePanel.open({ windowId: windowId! });
};

const closePanel = () => {
  chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    chrome.sidePanel.setOptions({ enabled: true });
  });
};

const changePanelShowStatus = () => {
  panelOpened = !panelOpened;

  if (panelOpened) {
    void openPanel(undefined);
  } else {
    closePanel();
  }
};

export const sidebarToggleListners = () => {
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === MESSAGE_SET_PANEL_OPEN_OR_NOT) {
      changePanelShowStatus();
    } else if (message.action === MESSAGE_OPEN_PANEL) {
      chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((error) => {
        panelOpened = false;
        errorLog(error);
      });
      if (!panelOpened) {
        changePanelShowStatus();
      }
    } else if (message.action === MESSAGE_PANEL_OPENED_PING_FROM_PANEL) {
      panelOpened = true;
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_LISTEN_PANEL_CLOSED_KEY) {
      port.onDisconnect.addListener(() => {
        panelOpened = false;
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

export const sidepanelMessageListners = () => {
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    (async () => {
      if (msg.type === MESSAGE_LOAD_THREAD) {
        const data = await loadThread(msg.threadId);
        sendResponse(
          data.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
        );
      }
    })();
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_STREAM_MESSAGE) {
      port.onMessage.addListener(async (msg) => {
        if (msg.type === MESSAGE_RUN_GRAPH_STREAM) {
          const { threadId, text } = msg;

          const thread = await loadThread(threadId);
          const memory = await loadUserMemory();

          debugLog('run graph stream', threadId, text, memory);

          port.postMessage({ done: true });
        }
      });
    }
  });
};
