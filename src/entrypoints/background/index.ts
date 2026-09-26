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

export default defineBackground(() => {
  onInstalled();
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    const handler = messageHandlers[msg?.action as keyof typeof messageHandlers];
    if (!handler) return false;

    (async () => {
      try {
        await whenBackgroundStateReady();
        await handler(msg, sendResponse);
      } catch (err) {
        errorLog('Message handler failed:', msg.action, err);
        sendResponse({ success: false, error: (err as Error).message ?? String(err) });
      }
    })();
    return true;
  });
});
