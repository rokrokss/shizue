import {
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
} from '@/config/constants';
import { createI18n } from '@wxt-dev/i18n';

export const createContextMenu = async () => {
  const i18n = createI18n();

  const contextMenuItems: chrome.contextMenus.CreateProperties[] = [
    {
      id: 'translatePage',
      title: i18n.t('overlayMenu.translatePage'),
      contexts: ['page'],
    },
    {
      id: 'summarizePage',
      title: i18n.t('overlayMenu.summarizePage'),
      contexts: ['page'],
    },
  ];

  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll();
  }

  for (const item of contextMenuItems) {
    chrome.contextMenus.create(item);
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id) {
      if (info.menuItemId === 'translatePage') {
        chrome.tabs.sendMessage(tab.id, {
          action: MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
        });
      } else if (info.menuItemId === 'summarizePage') {
        chrome.tabs.sendMessage(tab.id, {
          action: MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
        });
      }
    }
  });
};
