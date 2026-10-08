import { MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { debugLog } from '@/logs';

async function requestPanel(action: string, options?: { summarizePage?: boolean }): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ action, ...options });
    return response?.status === 'success';
  } catch (error) {
    // Existing tabs can keep an invalidated content script after an extension update.
    debugLog('Panel connection unavailable', error);
    return false;
  }
}

export const panelService = {
  openPanel: (options?: { summarizePage?: boolean }) => requestPanel(MESSAGE_OPEN_PANEL, options),
  setPanelOpenOrNot: () => requestPanel(MESSAGE_SET_PANEL_OPEN_OR_NOT),
};
