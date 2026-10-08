export const CONTENT_SCRIPT_PING = 'shizue_content_script_ping';
export const RECOVER_CONTENT_SCRIPTS = 'shizue_recover_content_scripts';
export type ContentScriptName = 'toggle' | 'youtube-caption-toggle';

export function registerContentScriptConnection(script: ContentScriptName) {
  const listener = (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (reply: unknown) => void) => {
    if (message?.action !== CONTENT_SCRIPT_PING || message.script !== script || !chrome.runtime.id) return false;
    sendResponse({ script, alive: true });
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => {
    // Chrome may already have invalidated this extension context during an update.
    try { chrome.runtime.onMessage.removeListener(listener); } catch { /* Old context. */ }
  };
}
