import {
  MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
  MESSAGE_INJECT_NETFLIX_BRIDGE,
  MESSAGE_INJECT_TWITCH_BRIDGE,
  MESSAGE_SCC_CAPTION_SNAPSHOT,
  MESSAGE_SCC_SET_HIDDEN,
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_WAIT_PANEL_SUMMARY,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_TRANSLATE_LIVE_CAPTION,
  MESSAGE_TRANSLATE_SUBTITLES,
  MESSAGE_TRANSLATE_YOUTUBE_CAPTION,
} from '@/config/constants';
import { openPanel, togglePanel } from '@/entrypoints/background/sidepanel';
import { db, getLatestMessageForThread, loadThread } from '@/lib/indexDB';
import { getTranslationHandler } from '@/services/background/translationHandler';
import { openPanelForSummary, waitForPanelSummary } from '@/services/background/panelSummary';

async function handleSetPanelOpenOrNot(
  msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  await togglePanel(sender.tab?.windowId);
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
        selectionText: m.selectionText,
        translateMode: m.translateMode ?? false,
        done: m.done,
        images: m.images,
        onInterrupt: m.onInterrupt,
        stopped: m.stopped,
        errorMessage: m.errorMessage,
        contextTruncated: m.contextTruncated,
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

async function handleOpenPanel(
  msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  if (msg.summarizePage === true && sender.tab?.id !== undefined) {
    await openPanelForSummary(sender.tab.id, sender.tab.windowId);
  } else {
    await openPanel(sender.tab?.windowId);
  }
  sendResponse({ status: 'success' });
}

async function handleWaitPanelSummary(_msg: any, sendResponse: (response?: any) => void) {
  await waitForPanelSummary();
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

async function handleTranslateLiveCaption(msg: any, sendResponse: (response?: any) => void) {
  const { lines, context, targetLanguage, metadata } = msg;
  sendResponse(
    await getTranslationHandler().translateLiveCaption(lines, context, targetLanguage, metadata)
  );
}

async function handleTranslateSubtitles(msg: any, sendResponse: (response?: any) => void) {
  const { lines, context, following, targetLanguage, metadata } = msg;
  sendResponse(
    await getTranslationHandler().translateSubtitles(lines, context, following, targetLanguage, metadata)
  );
}

// The Twitch caption script asks for its MAIN-world bridge when the tab predates the extension's
// install or update (recovery injects isolated scripts only).
async function handleInjectTwitchBridge(
  _msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  if (sender.tab?.id === undefined) return sendResponse({ status: 'error' });
  await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
    world: 'MAIN',
    files: ['content-scripts/twitch-player-bridge.js'],
  });
  sendResponse({ status: 'success' });
}

// Likewise for the Netflix caption script and its player bridge.
async function handleInjectNetflixBridge(
  _msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  if (sender.tab?.id === undefined) return sendResponse({ status: 'error' });
  await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
    world: 'MAIN',
    files: ['content-scripts/netflix-player-bridge.js'],
  });
  sendResponse({ status: 'success' });
}

// Stream Closed Captioner text comes from a nested extension frame; the caption script runs in
// the tab's top frame.
async function handleSccCaptionSnapshot(
  msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  if (sender.tab?.id !== undefined) {
    await chrome.tabs
      .sendMessage(sender.tab.id, { action: MESSAGE_SCC_CAPTION_SNAPSHOT, text: msg.text }, { frameId: 0 })
      .catch(() => {});
  }
  sendResponse({ status: 'success' });
}

// From the top frame to every frame of the tab; only the SCC frame acts on it.
async function handleSccSetHidden(
  msg: any,
  sendResponse: (response?: any) => void,
  sender: chrome.runtime.MessageSender
) {
  if (sender.tab?.id !== undefined) {
    await chrome.tabs
      .sendMessage(sender.tab.id, { action: MESSAGE_SCC_SET_HIDDEN, hidden: msg.hidden === true })
      .catch(() => {});
  }
  sendResponse({ status: 'success' });
}

export const messageHandlers = {
  [MESSAGE_LOAD_THREAD]: handleLoadThread,
  [MESSAGE_CANCEL_NOT_STARTED_MESSAGE]: handleLatestMessageForThread,
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: handleSetPanelOpenOrNot,
  [MESSAGE_OPEN_PANEL]: handleOpenPanel,
  [MESSAGE_WAIT_PANEL_SUMMARY]: handleWaitPanelSummary,
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: handleTranslateHtmlTextBatch,
  [MESSAGE_TRANSLATE_YOUTUBE_CAPTION]: handleTranslateYoutubeCaption,
  [MESSAGE_TRANSLATE_LIVE_CAPTION]: handleTranslateLiveCaption,
  [MESSAGE_TRANSLATE_SUBTITLES]: handleTranslateSubtitles,
  [MESSAGE_INJECT_TWITCH_BRIDGE]: handleInjectTwitchBridge,
  [MESSAGE_INJECT_NETFLIX_BRIDGE]: handleInjectNetflixBridge,
  [MESSAGE_SCC_CAPTION_SNAPSHOT]: handleSccCaptionSnapshot,
  [MESSAGE_SCC_SET_HIDDEN]: handleSccSetHidden,
};
