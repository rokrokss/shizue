import { MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { debugLog } from '@/logs';

async function requestPanel(action: string): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ action });
    return response?.status === 'success';
  } catch (error) {
    // Existing tabs can keep an invalidated content script after an extension update.
    debugLog('Panel connection unavailable', error);
    return false;
  }
}

export const panelService = {
  openPanel: () => requestPanel(MESSAGE_OPEN_PANEL),
  setPanelOpenOrNot: () => requestPanel(MESSAGE_SET_PANEL_OPEN_OR_NOT),
};
