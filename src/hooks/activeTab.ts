import { panelPageTab } from '@/lib/panelHost';
import { useEffect, useState } from 'react';

// The page the panel works on (the active tab beside a side panel), while it shows a web page.
export const useActiveWebTab = () => {
  const [tab, setTab] = useState<chrome.tabs.Tab>();

  useEffect(() => {
    const refresh = async () => {
      const page = await panelPageTab();
      setTab(page?.id !== undefined && /^https?:/.test(page.url ?? '') ? page : undefined);
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
