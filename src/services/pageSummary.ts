import { MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE, MESSAGE_UPDATE_PANEL_INIT_DATA, SUMMARY_PAGE_TEXT_MAX_CHARS } from '@/config/constants';
import { initSummarizePageContent } from '@/lib/initPanelData';
import { debugLog } from '@/logs';
import { panelService } from '@/services/panelService';
import { RECOVER_CONTENT_SCRIPTS } from '@/lib/contentScriptConnection';

export async function summarizeCurrentPage() {
  const text = document.body?.innerText.slice(0, SUMMARY_PAGE_TEXT_MAX_CHARS) ?? '';
  await initSummarizePageContent(document.title, text, window.location.href);
  // Storage is the durable handoff. A panel that is still loading reads it on mount.
  // An already mounted panel also observes the storage change.
  await chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((error) => {
    debugLog('Summary saved while the panel is loading', error);
  });
}

export async function requestPageSummary(tabId: number, recover = async (id: number): Promise<boolean> => {
  const result = await chrome.runtime.sendMessage({ action: RECOVER_CONTENT_SCRIPTS, tabId: id });
  return result?.success === true;
}) {
  const send = () => chrome.tabs.sendMessage(tabId, {
    action: MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
    openPanel: false,
  }, { frameId: 0 });
  let response;
  try { response = await send(); }
  catch (error) {
    // Retry only when delivery never happened. A closed reply channel may already
    // have saved the summary, so retrying that case could duplicate the request.
    if (!(error instanceof Error) || !error.message.includes('Receiving end does not exist') || !await recover(tabId)) throw error;
    response = await send();
  }
  if (!response?.success) throw new Error('Page summary receiver unavailable. Reload the page and try again.');
}

// Register before waiting for the page load, idle time, translations or React rendering.
export function registerPageSummaryListener() {
  const listener = (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: { success: boolean }) => void) => {
    if (message?.action !== MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE) return false;
    if (message.openPanel !== false) void panelService.openPanel();
    void summarizeCurrentPage().then(() => sendResponse({ success: true }), (error) => {
      debugLog('Page summary failed', error);
      sendResponse({ success: false });
    });
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    try { chrome.runtime.onMessage.removeListener(listener); } catch { /* Invalidated by an update. */ }
  };
}
