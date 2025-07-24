import {
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
  MESSAGE_DESCRIBE_IMAGE_FORWARD,
  MESSAGE_DESCRIBE_IMAGE_REQUEST,
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import { changePanelShowStatus, openPanel } from '@/entrypoints/background/sidepanel';
import { changePanelOpened, getPanelOpened } from '@/entrypoints/background/states/sidepanel';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';
import { getTranslationHandler } from '@/services/background/translationHandler';

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
        onInterrupt: m.onInterrupt,
        stopped: m.stopped,
        images: m.images,
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

async function handleDescribeImageRequest(msg: any, sendResponse: (response?: any) => void) {
  const { imageBase64, imageUrl } = msg;
  
  // 사이드패널을 열고 이미지 설명 요청을 전달
  if (!getPanelOpened()) {
    openPanel(undefined);
  }
  
  // 사이드패널로 메시지 전달 (사이드패널이 열린 후 약간의 지연)
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: MESSAGE_DESCRIBE_IMAGE_FORWARD,
          imageBase64,
          imageUrl
        }).catch(() => {
          // 탭에 content script가 없는 경우 무시
        });
      }
    });
  }, 500);
  
  sendResponse({ status: 'success' });
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_PANEL_OPENED_PING_FROM_PANEL]: handlePanelOpenedPingFromPanel,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_TRANSLATE_YOUTUBE_CAPTION]: handleTranslateYoutubeCaption,
  [MESSAGE_DESCRIBE_IMAGE_REQUEST]: handleDescribeImageRequest,
};
