import { STORAGE_PANEL_SOURCE_TAB } from '@/config/constants';

// The background opens the panel page with ?host=tab where the browser has no side panel.
export const isPanelTab = () => new URLSearchParams(location.search).get('host') === 'tab';

// The page the panel works on: the active tab beside a side panel, or, for a panel tab (itself the
// active tab), the tab it was last opened from, while that is still open.
export const panelPageTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  if (isPanelTab()) {
    const { [STORAGE_PANEL_SOURCE_TAB]: tabId } = await chrome.storage.session.get(STORAGE_PANEL_SOURCE_TAB);
    return typeof tabId === 'number' ? chrome.tabs.get(tabId).catch(() => undefined) : undefined;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

export const panelPageTabId = async () => (await panelPageTab())?.id;

const showTab = async (tabId: number) => {
  const tab = await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
  if (tab?.windowId !== undefined) await chrome.windows?.update(tab.windowId, { focused: true });
};

export const backToPage = async () => {
  const tabId = await panelPageTabId();
  if (tabId !== undefined) await showTab(tabId);
};

// Runs what needs the page on screen: a capture of it, or a selection on it. A panel tab covers the
// page, so the page comes forward for the run and the panel tab after it.
export const withPageShown = async <T>(run: (tab: chrome.tabs.Tab) => Promise<T>): Promise<T> => {
  const tab = await panelPageTab();
  if (tab?.id === undefined) throw new Error('No page available.');
  if (!isPanelTab()) return run(tab);
  const panel = await chrome.tabs.getCurrent();
  await showTab(tab.id);
  try {
    return await run(tab);
  } finally {
    if (panel?.id !== undefined) await showTab(panel.id);
  }
};
