import {
  MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE,
  MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT,
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
} from '@/config/constants';
import { getCurrentChatModel } from '@/entrypoints/background/states/models';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import { ChatModel, isChatModel, MODELS } from '@/lib/modelRegistry';
import { errorLog } from '@/logs';
import { createI18n } from '@wxt-dev/i18n';

// Image actions run on the chat model, so they are greyed out for text-only models.
const updateImageMenuItems = (model: ChatModel) => {
  const enabled = MODELS[model].supportsImages;
  for (const id of ['describeImage', 'extractImageText']) {
    // Callback form: the promise form needs Chrome 123+.
    chrome.contextMenus.update(id, { enabled }, () => {
      if (chrome.runtime.lastError) {
        errorLog('Failed to update context menu item:', id, chrome.runtime.lastError.message);
      }
    });
  }
};

export const createContextMenu = async () => {
  const i18n = createI18n();

  if (chrome.contextMenus) {
    // Menus persist across service worker restarts; clear them before re-creating the same IDs.
    await chrome.contextMenus.removeAll();
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.CHAT_MODEL) {
      const newChatModel = changes.CHAT_MODEL.newValue;
      if (isChatModel(newChatModel)) updateImageMenuItems(newChatModel);
    }
  });
  await whenBackgroundStateReady();
  updateImageMenuItems(getCurrentChatModel());
};
