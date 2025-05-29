import { languageListeners } from '@/entrypoints/background/language';
import { modelListeners } from '@/entrypoints/background/models';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { sidePanelMessageHandlers } from '@/entrypoints/background/sidepanel/messageHandlers';
import { backgroundLog } from '@/logs';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    (async () => {
      const action = msg.action as keyof typeof sidePanelMessageHandlers;

      if (sidePanelMessageHandlers[action]) {
        await sidePanelMessageHandlers[action](msg, sendResponse);
      }
    })();
    return true;
  });
});

