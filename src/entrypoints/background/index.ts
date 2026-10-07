import { MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT } from '@/config/constants';
import { createContextMenu } from '@/entrypoints/background/contextMenu';
import { onInstalled } from '@/entrypoints/background/onInstalled';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { languageListeners } from '@/entrypoints/background/states/language';
import { modelListeners } from '@/entrypoints/background/states/models';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import { backgroundLog, errorLog } from '@/logs';
import { messageHandlers } from '@/services/background/messageHandlers';

const PANEL_OPEN_ACTIONS = new Set([MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT]);

export default defineBackground(() => {
  onInstalled();
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = messageHandlers[msg?.action as keyof typeof messageHandlers];
    if (!handler) return false;

    (async () => {
      try {
        // sidePanel.open() must run synchronously within the sender's user gesture,
        // which is lost after an await.
        if (!PANEL_OPEN_ACTIONS.has(msg.action)) await whenBackgroundStateReady();
        await handler(msg, sendResponse, sender);
      } catch (err) {
        errorLog('Message handler failed:', msg.action, err);
        sendResponse({ success: false, error: (err as Error).message ?? String(err) });
      }
    })();
    return true;
  });
});
