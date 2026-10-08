import {
  isSelectionActionType,
  MESSAGE_CONTEXT_MENU_DESCRIBE_IMAGE,
  MESSAGE_CONTEXT_MENU_EXTRACT_IMAGE_TEXT,
  MESSAGE_CONTEXT_MENU_SELECTION_ACTION,
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
} from '@/config/constants';
import { getCurrentChatModel, getCurrentLocalServer } from '@/entrypoints/background/states/models';
import { whenBackgroundStateReady } from '@/entrypoints/background/states/ready';
import {
  ChatModel,
  isChatModel,
  LocalServerConfig,
  modelSupportsImages,
} from '@/lib/modelRegistry';
import { errorLog } from '@/logs';
import { i18n } from '#i18n';

// Image actions run on the chat model, so they are greyed out for text-only models.
const updateImageMenuItems = (model: ChatModel, localServer?: LocalServerConfig | null) => {
  const enabled = modelSupportsImages(model, localServer);
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
    // Chrome hides the 'page' items while text is selected, so these take their place.
    {
      id: 'translateSelection',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.translateSelection'),
      contexts: ['selection'],
    },
    {
      id: 'explainSelection',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.explainSelection'),
      contexts: ['selection'],
    },
    {
      id: 'summarizeSelection',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.summarizeSelection'),
      contexts: ['selection'],
    },
    {
      id: 'fixGrammarSelection',
      parentId: 'shizue-parent',
      title: i18n.t('overlayMenu.fixGrammarSelection'),
      contexts: ['selection'],
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
      } else if (isSelectionActionType(info.menuItemId)) {
        chrome.tabs.sendMessage(tab.id, {
          action: MESSAGE_CONTEXT_MENU_SELECTION_ACTION,
          actionType: info.menuItemId,
          selectionText: info.selectionText,
          frameId: info.frameId,
        });
      }
    }
  });

  // Read the changed values directly: the model state's own listener may not have run yet.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.CHAT_MODEL || changes.LOCAL_SERVER)) {
      const newChatModel = changes.CHAT_MODEL ? changes.CHAT_MODEL.newValue : getCurrentChatModel();
      const localServer = changes.LOCAL_SERVER
        ? (changes.LOCAL_SERVER.newValue as LocalServerConfig | null)
        : getCurrentLocalServer();
      if (isChatModel(newChatModel)) updateImageMenuItems(newChatModel, localServer);
    }
  });
  await whenBackgroundStateReady();
  updateImageMenuItems(getCurrentChatModel(), getCurrentLocalServer());
};
