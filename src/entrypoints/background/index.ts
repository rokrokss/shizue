import { MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT, MESSAGE_WAIT_PANEL_SUMMARY } from '@/config/constants';
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
import { CHATGPT_CALLBACK_MESSAGE, CHATGPT_SETTINGS_MESSAGE } from '@/lib/chatgpt';
import { handleChatGPTCallback, handleChatGPTSettings } from '@/services/background/chatgpt';
import { RECOVER_CONTENT_SCRIPTS } from '@/lib/contentScriptConnection';
import { contentScriptRecoveryListeners, recoverTabContentScripts } from '@/services/background/contentScriptRecovery';

const IMMEDIATE_PANEL_ACTIONS = new Set([MESSAGE_OPEN_PANEL, MESSAGE_SET_PANEL_OPEN_OR_NOT, MESSAGE_WAIT_PANEL_SUMMARY]);

export default defineBackground(() => {
  onInstalled();
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === RECOVER_CONTENT_SCRIPTS) {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) ||
          !Number.isInteger(msg.tabId) || msg.tabId < 0) return false;
      void recoverTabContentScripts(msg.tabId).then((success) => sendResponse({ success }));
      return true;
    }
    if (msg?.action === CHATGPT_SETTINGS_MESSAGE) {
      // Account operations are available only to our own extension UI, never page scripts.
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
      handleChatGPTSettings(msg.operation, msg.accountId)
        .then((connection) => sendResponse({ success: true, connection }))
        .catch((error) => sendResponse({ success: false, error: error.message, errorCode: error.code }));
      return true;
    }
    if (msg?.action === CHATGPT_CALLBACK_MESSAGE) {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('chatgpt-callback.html'))) return false;
      sendResponse(handleChatGPTCallback(msg.search));
      return false;
    }
    const handler = messageHandlers[msg?.action as keyof typeof messageHandlers];
    if (!handler) return false;

    (async () => {
      try {
        // sidePanel.open() must run synchronously within the sender's user gesture,
        // which is lost after an await. Summary readiness also needs no model setup.
        if (!IMMEDIATE_PANEL_ACTIONS.has(msg.action)) await whenBackgroundStateReady();
        await handler(msg, sendResponse, sender);
      } catch (err) {
        errorLog('Message handler failed:', msg.action, err);
        sendResponse({ success: false, error: (err as Error).message ?? String(err) });
      }
    })();
    return true;
  });
  contentScriptRecoveryListeners();
});
