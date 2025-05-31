import { MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';

async function openPanel() {
  void chrome.runtime.sendMessage({ action: MESSAGE_OPEN_PANEL });
}

async function setPanelOpenOrNot() {
  void chrome.runtime.sendMessage({ action: MESSAGE_SET_PANEL_OPEN_OR_NOT });
}

export const panelService = {
  openPanel,
  setPanelOpenOrNot,
};
