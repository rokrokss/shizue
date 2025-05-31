import { messageHandlers } from '@/services/background/messageHandlers';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { languageListeners } from '@/entrypoints/background/states/language';
import { modelListeners } from '@/entrypoints/background/states/models';
import { backgroundLog } from '@/logs';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    (async () => {
      const action = msg.action as keyof typeof messageHandlers;

      if (messageHandlers[action]) {
        await messageHandlers[action](msg, sendResponse);
      }
    })();
    return true;
  });
});
