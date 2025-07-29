import {
  MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE,
  MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT,
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
} from '@/config/constants';
import { createI18n } from '@wxt-dev/i18n';

export const createContextMenu = async () => {
  const i18n = createI18n();

  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll();
  }

  // Create parent menu with custom title "Shizue"
  chrome.contextMenus.create({
    id: 'shizue-parent',
    title: i18n.t('overlayMenu.shizue'),
    contexts: ['all'],
  });

  const contextMenuItems: chrome.contextMenus.CreateProperties[] = [
    {
      id: 'translatePage',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.translatePage'),
      contexts: ['page'],
    },
    {
      id: 'summarizePage',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.summarizePage'),
      contexts: ['page'],
    },
    {
      id: 'describeImage',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.describeImage'),
      contexts: ['image'],
    },
    {
      id: 'extractImageText',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.extractImageText'),
      contexts: ['image'],
    },
  ];

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
      } else if (info.menuItemId === 'describeImage') {
        chrome.tabs.sendMessage(tab.id, {
          action: MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE,
          srcUrl: info.srcUrl,
        });
      } else if (info.menuItemId === 'extractImageText') {
        chrome.tabs.sendMessage(tab.id, {
          action: MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT,
          srcUrl: info.srcUrl,
        });
      }
    }
  });
};
