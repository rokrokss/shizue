import { CONTENT_SCRIPT_PING, type ContentScriptName } from '@/lib/contentScriptConnection';
import { debugLog } from '@/logs';

const SESSION_RECOVERY_KEY = 'CONTENT_SCRIPTS_RECOVERED';
const recoveringTabs = new Map<number, Promise<boolean>>();
let initialRecovery: Promise<void> | undefined;

export function scriptsForPage(value: string | undefined): ContentScriptName[] {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return [];
    if (url.hostname === 'chromewebstore.google.com' ||
        (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) return [];
    return url.protocol === 'https:' && ['youtube.com', 'www.youtube.com'].includes(url.hostname)
      ? ['toggle', 'youtube-caption-toggle'] : ['toggle'];
  } catch { return []; }
}

async function isConnected(tabId: number, script: ContentScriptName, documentId?: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      chrome.tabs.sendMessage(tabId, { action: CONTENT_SCRIPT_PING, script },
        documentId ? { documentId } : { frameId: 0 }),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1_500); }),
    ]);
    return reply?.alive === true && reply.script === script;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function recoverTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const scripts = scriptsForPage(tab.url);
    // Let Chrome restore sleeping tabs itself. Activation/completion will check them again.
    if (!scripts.length || tab.discarded || tab.frozen) return false;
    const states = await Promise.all(scripts.map((script) => isConnected(tabId, script)));
    const missing = scripts.filter((_, index) => !states[index]);
    if (!missing.length) return true;

    // Pin the recovery to this document so navigation cannot inject YouTube code into
    // an unrelated page between the URL check, stylesheet and script operations.
    const [document] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => location.href,
    });
    if (!document?.documentId || document.result !== tab.url) return false;
    const target = { tabId, documentIds: [document.documentId] };
    await chrome.scripting.insertCSS({ target, files: ['fonts/fonts.css'] });
    for (const script of missing) {
      // A declarative script may have started while the recovery probe was running.
      if (await isConnected(tabId, script, document.documentId)) continue;
      await chrome.scripting.executeScript({ target, files: [`content-scripts/${script}.js`] });
    }
    const restored = await Promise.all(scripts.map((script) => isConnected(tabId, script, document.documentId)));
    return restored.every(Boolean);
  } catch (error) {
    // Closed tabs, restricted documents and withheld site access are expected here.
    debugLog('Content script recovery unavailable', error);
    return false;
  }
}

export function recoverTabContentScripts(tabId: number): Promise<boolean> {
  const pending = recoveringTabs.get(tabId);
  if (pending) return pending;
  const recovery = recoverTab(tabId).finally(() => {
    if (recoveringTabs.get(tabId) === recovery) recoveringTabs.delete(tabId);
  });
  recoveringTabs.set(tabId, recovery);
  return recovery;
}

export async function recoverOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  tabs.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
  // Bound work when a browser session contains many tabs.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tabs.length) }, async () => {
    while (next < tabs.length) {
      const tab = tabs[next++];
      if (tab.id !== undefined) await recoverTabContentScripts(tab.id);
    }
  }));
}

export function recoverInitialTabs(): Promise<void> {
  if (initialRecovery) return initialRecovery;
  initialRecovery = (async () => {
    // Session storage is cleared on extension reload/update, but survives worker sleep.
    const session = await chrome.storage.session.get(SESSION_RECOVERY_KEY);
    if (session[SESSION_RECOVERY_KEY]) return;
    await recoverOpenTabs();
    await chrome.storage.session.set({ [SESSION_RECOVERY_KEY]: true });
  })().finally(() => { initialRecovery = undefined; });
  return initialRecovery;
}

export function contentScriptRecoveryListeners() {
  const recover = (tabId: number) => { void recoverTabContentScripts(tabId); };
  const initialize = () => { void recoverInitialTabs().catch((error) => debugLog('Initial content recovery failed', error)); };
  chrome.runtime.onInstalled.addListener(initialize);
  chrome.runtime.onStartup.addListener(initialize);
  chrome.tabs.onActivated.addListener(({ tabId }) => recover(tabId));
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'complete' || change.discarded === false || change.frozen === false) recover(tabId);
  });
  chrome.permissions.onAdded.addListener(() => {
    void recoverOpenTabs().catch((error) => debugLog('Site access recovery failed', error));
  });
  initialize();
}
