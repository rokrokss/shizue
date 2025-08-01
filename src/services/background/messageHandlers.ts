import {
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
  MESSAGE_AUTH_LOGIN,
  MESSAGE_AUTH_LOGOUT,
  MESSAGE_AUTH_CHECK_STATUS,
  MESSAGE_AUTH_GET_USER_INFO,
  MESSAGE_AUTH_REFRESH_TOKEN,
} from '@/config/constants';
import { changePanelShowStatus, openPanel } from '@/entrypoints/background/sidepanel';
import { changePanelOpened, getPanelOpened } from '@/entrypoints/background/states/sidepanel';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';
import { getTranslationHandler } from '@/services/background/translationHandler';
import { AuthService } from '@/services/authService';
import { TokenManager } from '@/services/tokenManager';

async function handleSetPanelOpenOrNot(msg: any, sendResponse: (response?: any) => void) {
  changePanelShowStatus();
  sendResponse({ status: 'success' });
}

async function handlePanelOpenedPingFromPanel(msg: any, sendResponse: (response?: any) => void) {
  changePanelOpened(true);
  sendResponse({ status: 'success' });
}

async function handleLoadThread(msg: any, sendResponse: (response?: any) => void) {
  const data = await loadThread(msg.threadId);
  sendResponse(
    data
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
        actionType: m.actionType,
        summaryTitle: m.summaryTitle,
        summaryPageLink: m.summaryPageLink,
        translateMode: m.translateMode ?? false,
        done: m.done,
        images: m.images,
        onInterrupt: m.onInterrupt,
        stopped: m.stopped,
      }))
  );
}

async function handleLatestMessageForThread(msg: any, sendResponse: (response?: any) => void) {
  const latestMessage = await getLatestMessageForThread(msg.threadId);
  if (
    latestMessage &&
    !latestMessage.done &&
    !latestMessage.onInterrupt &&
    !latestMessage.stopped &&
    latestMessage.role === 'ai'
  ) {
    await db.messages.update(latestMessage.id, { stopped: true });
  }
  sendResponse({ status: 'success' });
}

async function handleOpenPanel(msg: any, sendResponse: (response?: any) => void) {
  if (!getPanelOpened()) {
    openPanel(undefined);
  }
  sendResponse({ status: 'success' });
}

async function handleTranslateHtmlTextBatch(msg: any, sendResponse: (response?: any) => void) {
  const { texts } = msg;
  const translatedTexts = await getTranslationHandler().translateHtmlTextBatch(texts);
  sendResponse(translatedTexts);
}

async function handleTranslateYoutubeCaption(msg: any, sendResponse: (response?: any) => void) {
  const { captions, targetLanguage, metadata } = msg;
  const translatedCaptions = await getTranslationHandler().translateYoutubeCaption(
    captions,
    targetLanguage,
    metadata
  );
  sendResponse(translatedCaptions);
}

// Define actions that require authentication
export const AUTH_REQUIRED_ACTIONS = new Set([
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
  // Add more actions that require auth here
]);

// Auth message handlers
async function handleAuthLogin(msg: any, sendResponse: (response?: any) => void) {
  try {
    const result = await AuthService.handleAuthMessage({ action: MESSAGE_AUTH_LOGIN });
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Login failed' });
  }
}

async function handleAuthLogout(msg: any, sendResponse: (response?: any) => void) {
  try {
    const result = await AuthService.handleAuthMessage({ action: MESSAGE_AUTH_LOGOUT });
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Logout failed' });
  }
}

async function handleAuthCheckStatus(msg: any, sendResponse: (response?: any) => void) {
  try {
    const result = await AuthService.handleAuthMessage({ action: MESSAGE_AUTH_CHECK_STATUS });
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Status check failed' });
  }
}

async function handleAuthGetUserInfo(msg: any, sendResponse: (response?: any) => void) {
  try {
    const result = await AuthService.handleAuthMessage({ action: MESSAGE_AUTH_GET_USER_INFO });
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Failed to get user info' });
  }
}

async function handleAuthRefreshToken(msg: any, sendResponse: (response?: any) => void) {
  try {
    const result = await TokenManager.handleRefreshMessage();
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error instanceof Error ? error.message : 'Token refresh failed' });
  }
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_PANEL_OPENED_PING_FROM_PANEL]: handlePanelOpenedPingFromPanel,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_TRANSLATE_YOUTUBE_CAPTION]: handleTranslateYoutubeCaption,
  // Auth handlers
  [MESSAGE_AUTH_LOGIN]: handleAuthLogin,
  [MESSAGE_AUTH_LOGOUT]: handleAuthLogout,
  [MESSAGE_AUTH_CHECK_STATUS]: handleAuthCheckStatus,
  [MESSAGE_AUTH_GET_USER_INFO]: handleAuthGetUserInfo,
  [MESSAGE_AUTH_REFRESH_TOKEN]: handleAuthRefreshToken,
};
