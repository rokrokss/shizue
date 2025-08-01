import { createContextMenu } from '@/entrypoints/background/contextMenu';
import {
  sidebarToggleListeners,
  sidePanelMessageListeners,
} from '@/entrypoints/background/sidepanel';
import { languageListeners } from '@/entrypoints/background/states/language';
import { modelListeners } from '@/entrypoints/background/states/models';
import { backgroundLog } from '@/logs';
import { messageHandlers, AUTH_REQUIRED_ACTIONS } from '@/services/background/messageHandlers';
import { AuthService } from '@/services/authService';
import { TokenManager } from '@/services/tokenManager';

export default defineBackground(() => {
  backgroundLog();
  sidebarToggleListeners();
  languageListeners();
  sidePanelMessageListeners();
  modelListeners();
  createContextMenu();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      const action = msg.action as keyof typeof messageHandlers;

      // Check if action requires authentication
      if (AUTH_REQUIRED_ACTIONS.has(action)) {
        const authService = AuthService.getInstance();
        const isAuthenticated = await authService.checkAuthStatus();

        if (!isAuthenticated) {
          // Open side panel for login
          const tabId = sender.tab?.id;
          if (tabId) {
            await chrome.sidePanel.open({ tabId });
          }
          sendResponse({ error: 'AUTH_REQUIRED', needsLogin: true });
          return;
        }

        // Add auth token to message for authenticated requests
        const tokenManager = TokenManager.getInstance();
        try {
          const token = await tokenManager.getValidToken();
          msg.authToken = token;
        } catch {
          // Token refresh failed, need to re-login
          const tabId = sender.tab?.id;
          if (tabId) {
            await chrome.sidePanel.open({ tabId });
          }
          sendResponse({ error: 'AUTH_REQUIRED', needsLogin: true });
          return;
        }
      }

      if (messageHandlers[action]) {
        await messageHandlers[action](msg, sendResponse);
      }
    })();
    return true;
  });
});
