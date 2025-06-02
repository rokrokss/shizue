import {
  MESSAGE_CAN_TRANSLATE,
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_TRANSLATE_HTML_TEXT,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
} from '@/config/constants';
import { changePanelShowStatus, openPanel } from '@/entrypoints/background/sidepanel';
import { changePanelOpened, getPanelOpened } from '@/entrypoints/background/states/sidepanel';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';
import { getTranslationHandler } from '@/services/background/translationHandler';

async function handleSetPanelOpenOrNot(msg: any, sendResponse: (response?: any) => void) {
  changePanelShowStatus();
}

async function handlePanelOpenedPingFromPanel(msg: any, sendResponse: (response?: any) => void) {
  changePanelOpened(true);
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
}

async function handleOpenPanel(msg: any, sendResponse: (response?: any) => void) {
  if (!getPanelOpened()) {
    openPanel(undefined);
  }
}

async function handleTranslateHtmlText(msg: any, sendResponse: (response?: any) => void) {
  const { text } = msg;
  const translatedText = await getTranslationHandler().translateHtmlText(text);
  sendResponse(translatedText);
}

async function handleTranslateHtmlTextBatch(msg: any, sendResponse: (response?: any) => void) {
  const { texts } = msg;
  const translatedTexts = await getTranslationHandler().translateHtmlTextBatch(texts);
  sendResponse(translatedTexts);
}

async function handleCanTranslate(msg: any, sendResponse: (response?: any) => void) {
  const canTranslate = await getTranslationHandler().canTranslate();
  sendResponse(canTranslate);
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_PANEL_OPENED_PING_FROM_PANEL]: handlePanelOpenedPingFromPanel,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_TRANSLATE_HTML_TEXT]: handleTranslateHtmlText,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_CAN_TRANSLATE]: handleCanTranslate,
};
