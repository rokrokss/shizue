import {
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
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
        done: m.done,
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

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_PANEL_OPENED_PING_FROM_PANEL]: handlePanelOpenedPingFromPanel,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_TRANSLATE_YOUTUBE_CAPTION]: handleTranslateYoutubeCaption,
};
