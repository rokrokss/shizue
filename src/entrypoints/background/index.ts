import { createContextMenu } from '@/entrypoints/background/contextMenu';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { languageListeners } from '@/entrypoints/background/states/language';
import { modelListeners } from '@/entrypoints/background/states/models';
import { backgroundLog } from '@/logs';
import { messageHandlers } from '@/services/background/messageHandlers';
import { ensurePdfTranslationHandler } from '@/services/background/pdfTranslationHandler';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();
  ensurePdfTranslationHandler();

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
