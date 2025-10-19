import {
  MESSAGE_RETRY_GRAPH_STREAM,
  MESSAGE_RUN_GRAPH_STREAM,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  PORT_STREAM_MESSAGE,
} from '@/config/constants';
import {
  getPanelOpenedWindow,
  setPanelOpenedWindow,
} from '@/entrypoints/background/states/sidepanel';
import { debugLog, errorLog } from '@/logs';
import { getChatModelHandler } from '@/services/background/chatModelHandler';

export const openPanel = async (windowId: number | undefined) => {
  try {
    if (windowId === undefined) {
      errorLog('[openPanel] windowId is required to maintain user gesture');
      return;
    }

    debugLog('[openPanel] Opening panel in window:', windowId);
    debugLog('[openPanel] Current state before open:', getPanelOpenedWindow());

    chrome.sidePanel.open({ windowId });

    debugLog('[openPanel] chrome.sidePanel.open() called successfully');

    // 즉시 상태 설정하여 Port disconnect race condition 방지 (Chrome Storage에도 저장)
    await setPanelOpenedWindow(windowId);
    debugLog('[openPanel] State updated to:', getPanelOpenedWindow());
  } catch (error) {
    errorLog('[openPanel] Failed to open panel:', error, 'windowId:', windowId);
  }
};

export const closePanel = async (windowId?: number) => {
  // Chrome 114+에서는 sidePanel.close() 사용 가능
  if (typeof (chrome.sidePanel as any).close === 'function') {
    if (windowId !== undefined) {
      debugLog('[closePanel] Closing panel in window:', windowId);

      // 닫기 전에 먼저 상태 초기화 (Port disconnect가 호출되지 않을 수 있음)
      const currentOpenedWindowId = getPanelOpenedWindow();
      if (currentOpenedWindowId === windowId) {
        await setPanelOpenedWindow(undefined);
        debugLog('[closePanel] State cleared for window:', windowId);
      }

      (chrome.sidePanel as any).close({ windowId });
    } else {
      // windowId 없으면 fallback to disable/enable trick
      debugLog('[closePanel] Using fallback disable/enable trick');
      await setPanelOpenedWindow(undefined);
      chrome.sidePanel.setOptions({ enabled: false });
      chrome.sidePanel.setOptions({ enabled: true });
    }
  } else {
    // Fallback: disable/enable trick (모든 윈도우에 영향)
    debugLog('[closePanel] Using fallback disable/enable trick (old Chrome)');
    await setPanelOpenedWindow(undefined);
    chrome.sidePanel.setOptions({ enabled: false });
    chrome.sidePanel.setOptions({ enabled: true });
  }
};

export const changePanelShowStatus = async (windowId: number | undefined) => {
  if (windowId === undefined) {
    errorLog('[changePanelShowStatus] windowId is undefined, cannot toggle panel');
    return;
  }

  const currentOpenedWindowId = getPanelOpenedWindow();

  debugLog('[changePanelShowStatus] current:', currentOpenedWindowId, 'requested:', windowId);

  // 같은 윈도우에서 토글 → 닫기
  if (currentOpenedWindowId === windowId) {
    debugLog('[changePanelShowStatus] Same window, closing panel');
    await closePanel(windowId);
  }
  // 다른 윈도우 또는 처음 열기 → 열기
  else {
    // 다른 윈도우에서 이미 열려있으면 먼저 닫기
    if (currentOpenedWindowId !== undefined) {
      debugLog('[changePanelShowStatus] Closing panel in window:', currentOpenedWindowId);
      await closePanel(currentOpenedWindowId);
    }

    debugLog('[changePanelShowStatus] Different window or first open, opening panel');
    await openPanel(windowId);
    // setPanelOpenedWindow(windowId)는 openPanel() 내부에서 호출됨
  }
};

export const sidebarToggleListeners = () => {
  if (typeof chrome.sidePanel === 'undefined') return;

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => errorLog(error));

  chrome.action.onClicked.addListener((tab) => {
    const windowId = tab.windowId;
    changePanelShowStatus(windowId);
  });

  chrome.runtime.onConnect.addListener((port) => {
    const portNameParts = port.name.split(':');

    if (portNameParts[0] === PORT_LISTEN_PANEL_CLOSED_KEY) {
      const windowId = portNameParts[1] ? parseInt(portNameParts[1]) : undefined;

      port.onDisconnect.addListener(async () => {
        const currentOpenedWindowId = getPanelOpenedWindow();

        // 현재 열린 윈도우와 같을 때만 초기화 (Chrome Storage에서도 제거)
        // closePanel()에서 이미 초기화했을 수 있으므로 체크
        if (windowId !== undefined && currentOpenedWindowId === windowId) {
          debugLog('[Port disconnect] Clearing state for window:', windowId);
          await setPanelOpenedWindow(undefined);
        } else if (currentOpenedWindowId === undefined) {
          debugLog('[Port disconnect] State already cleared for window:', windowId);
        } else {
          debugLog(
            '[Port disconnect] Ignoring disconnect from window:',
            windowId,
            'current:',
            currentOpenedWindowId
          );
        }
      });
    }
  });

  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-sidepanel') {
      debugLog('toggle-sidepanel command received');

      // Keyboard shortcut은 User Gesture를 유지하기 어려우므로
      // 마지막 활성 탭의 windowId를 사용하되, 실패 시 에러 로그
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs[0]?.windowId) {
          changePanelShowStatus(tabs[0].windowId);
        } else {
          errorLog('[toggle-sidepanel] No active tab found, use extension icon instead');
        }
      } catch (error) {
        errorLog('[toggle-sidepanel] Failed to get active tab:', error);
        errorLog('[toggle-sidepanel] Please use extension icon to open side panel');
      }
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
