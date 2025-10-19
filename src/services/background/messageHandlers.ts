import {
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
  MESSAGE_GET_PANEL_OPENED_WINDOW,
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import { changePanelShowStatus, closePanel, openPanel } from '@/entrypoints/background/sidepanel';
import {
  changePanelOpened,
  getPanelOpenedWindow,
  setPanelOpenedWindow,
} from '@/entrypoints/background/states/sidepanel';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';
import { debugLog } from '@/logs';
import { getTranslationHandler } from '@/services/background/translationHandler';

async function handleSetPanelOpenOrNot(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const windowId = sender.tab?.windowId;
  changePanelShowStatus(windowId);
  sendResponse({ status: 'success' });
}

async function handlePanelOpenedPingFromPanel(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const windowId = msg.windowId;
  if (windowId !== undefined) {
    debugLog('[handlePanelOpenedPingFromPanel] Panel opened in window:', windowId);
    debugLog('[handlePanelOpenedPingFromPanel] Current state:', getPanelOpenedWindow());

    // 실제로 패널이 열린 후에만 상태 업데이트
    setPanelOpenedWindow(windowId);
    changePanelOpened(true); // 기존 호환성 유지

    debugLog('[handlePanelOpenedPingFromPanel] State updated to:', getPanelOpenedWindow());
  }
  sendResponse({ status: 'success' });
}

async function handleLoadThread(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
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

async function handleLatestMessageForThread(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
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

async function handleOpenPanel(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const windowId = sender.tab?.windowId;
  const currentOpenedWindowId = getPanelOpenedWindow();

  // 다른 윈도우에서 이미 열려있으면 먼저 닫기
  if (currentOpenedWindowId !== undefined && currentOpenedWindowId !== windowId) {
    debugLog('[handleOpenPanel] Closing panel in window:', currentOpenedWindowId);
    closePanel(currentOpenedWindowId);
  }

  openPanel(windowId);
  sendResponse({ status: 'success' });
}

async function handleTranslateHtmlTextBatch(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const { texts } = msg;
  const translatedTexts = await getTranslationHandler().translateHtmlTextBatch(texts);
  sendResponse(translatedTexts);
}

async function handleTranslateYoutubeCaption(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const { captions, targetLanguage, metadata } = msg;
  const translatedCaptions = await getTranslationHandler().translateYoutubeCaption(
    captions,
    targetLanguage,
    metadata
  );
  sendResponse(translatedCaptions);
}

async function handleGetPanelOpenedWindow(
  _msg: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const windowId = getPanelOpenedWindow();
  sendResponse({ windowId });
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_PANEL_OPENED_PING_FROM_PANEL]: handlePanelOpenedPingFromPanel,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_TRANSLATE_YOUTUBE_CAPTION]: handleTranslateYoutubeCaption,
  [MESSAGE_GET_PANEL_OPENED_WINDOW]: handleGetPanelOpenedWindow,
};
