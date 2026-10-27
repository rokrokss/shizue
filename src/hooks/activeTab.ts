import { useEffect, useState } from 'react';

// The active tab of the window the side panel is in, while it shows a web page.
export const useActiveWebTab = () => {
  const [tab, setTab] = useState<chrome.tabs.Tab>();

  useEffect(() => {
    const refresh = async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTab(active?.id !== undefined && /^https?:/.test(active.url ?? '') ? active : undefined);
    };
    const onUpdated = (_tabId: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url || change.title || change.status === 'complete') refresh();
    };

    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return tab;
};
