import { STORAGE_PANEL_OPENED_WINDOW_ID } from '@/config/constants';
import { debugLog } from '@/logs';

// In-memory cache (빠른 접근용)
let panelOpenedWindowId: number | undefined;

/**
 * Background 시작 시 Chrome Storage에서 side panel 상태를 복원합니다.
 * Service worker 재시작 후에도 상태를 유지하기 위함입니다.
 */
export const loadSidePanelState = async () => {
  try {
    const result = await chrome.storage.local.get(STORAGE_PANEL_OPENED_WINDOW_ID);
    const storedWindowId = result[STORAGE_PANEL_OPENED_WINDOW_ID];

    if (storedWindowId !== undefined) {
      panelOpenedWindowId = storedWindowId;
      debugLog('[loadSidePanelState] Restored panel state, windowId:', storedWindowId);
    }
  } catch (error) {
    debugLog('[loadSidePanelState] Failed to load state:', error);
  }
};

export const setPanelOpenedWindow = async (windowId: number | undefined) => {
  panelOpenedWindowId = windowId;

  // Chrome Storage에 영구 저장
  try {
    if (windowId === undefined) {
      await chrome.storage.local.remove(STORAGE_PANEL_OPENED_WINDOW_ID);
    } else {
      await chrome.storage.local.set({ [STORAGE_PANEL_OPENED_WINDOW_ID]: windowId });
    }
  } catch (error) {
    debugLog('[setPanelOpenedWindow] Failed to save state:', error);
  }
};

export const getPanelOpenedWindow = () => panelOpenedWindowId;

// 호환성을 위해 유지 (Port disconnect 등에서 사용)
export const changePanelOpened = async (status: boolean) => {
  if (!status) {
    await setPanelOpenedWindow(undefined);
  }
};

export const getPanelOpened = () => panelOpenedWindowId !== undefined;
