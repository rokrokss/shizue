import { createContextMenu } from '@/entrypoints/background/contextMenu';
import { onInstalled } from '@/entrypoints/background/onInstalled';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { languageListeners } from '@/entrypoints/background/states/language';
import { modelListeners } from '@/entrypoints/background/states/models';
import { backgroundLog } from '@/logs';
import { messageHandlers } from '@/services/background/messageHandlers';

export default defineBackground(() => {
  onInstalled();
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      const action = msg.action as keyof typeof messageHandlers;

      if (messageHandlers[action]) {
        await messageHandlers[action](msg, sender, sendResponse);
      }
    })();
    return true;
  });
});
