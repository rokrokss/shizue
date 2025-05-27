import {
  MESSAGE_LOAD_THREAD,
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_RUN_GRAPH_STREAM,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  PORT_STREAM_MESSAGE,
  STORAGE_SETTINGS,
} from '@/config/constants';
import { getCurrentLanguage } from '@/entrypoints/background/language';
import { loadUserMemory } from '@/hooks/userMemory';
import { debugLog, errorLog } from '@/logs';
import { loadThread } from '@/utils/indexDB';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

let panelOpened = false;
let currentWindowId: number | undefined;

const updateCurrentWindowId = () => {
  chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
    currentWindowId = currentWindow.id;
  });
};

const openPanel = async (windowId: number | undefined) => {
  if (windowId === undefined) {
    windowId = currentWindowId;
  }
  chrome.sidePanel.open({ windowId: windowId! });
};

const closePanel = () => {
  chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    chrome.sidePanel.setOptions({ enabled: true });
  });
};

const changePanelShowStatus = () => {
  panelOpened = !panelOpened;

  if (panelOpened) {
    void openPanel(undefined);
  } else {
    closePanel();
  }
};

export const sidebarToggleListners = () => {
  if (typeof chrome.sidePanel === 'undefined') return;

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => errorLog(error));

  updateCurrentWindowId();

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      currentWindowId = windowId;
    }
  });

  chrome.windows.onCreated.addListener(() => {
    updateCurrentWindowId();
  });

  chrome.windows.onRemoved.addListener(() => {
    updateCurrentWindowId();
  });

  chrome.action.onClicked.addListener(() => {
    changePanelShowStatus();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === MESSAGE_SET_PANEL_OPEN_OR_NOT) {
      changePanelShowStatus();
    } else if (message.action === MESSAGE_OPEN_PANEL) {
      chrome.runtime.sendMessage({ action: MESSAGE_UPDATE_PANEL_INIT_DATA }).catch((error) => {
        panelOpened = false;
        errorLog(error);
      });
      if (!panelOpened) {
        changePanelShowStatus();
      }
    } else if (message.action === MESSAGE_PANEL_OPENED_PING_FROM_PANEL) {
      panelOpened = true;
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_LISTEN_PANEL_CLOSED_KEY) {
      port.onDisconnect.addListener(() => {
        panelOpened = false;
      });
    }
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-sidepanel') {
      debugLog('toggle-sidepanel command received');
      changePanelShowStatus();
    }
  });
};

export const sidepanelMessageListners = () => {
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    (async () => {
      if (msg.type === MESSAGE_LOAD_THREAD) {
        const data = await loadThread(msg.threadId);
        sendResponse(
          data
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content, done: m.done }))
        );
      }
    })();
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_STREAM_MESSAGE) return;

    const abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.type === MESSAGE_RUN_GRAPH_STREAM) {
        const { threadId } = msg;

        const thread = await loadThread(threadId);
        const memory = (await loadUserMemory()).text;

        // test
        const llm = new ChatOpenAI({
          modelName: 'chatgpt-4o-latest',
          temperature: 0.7,
          apiKey: await chrome.storage.local
            .get(STORAGE_SETTINGS)
            .then((v) => v[STORAGE_SETTINGS].openAIKey),
        });

        const initialAIMessage = getInitialAIMessage(getCurrentLanguage());
        const initialSystemMessage = getInitialSystemMessage(getCurrentLanguage());

        debugLog('thread', thread);

        const messages = [
          new AIMessage(initialAIMessage),
          new SystemMessage(initialSystemMessage),
          ...thread.map((m) =>
            m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content)
          ),
        ];

        debugLog('messages', messages);

        const messageId = crypto.randomUUID();

        let full = '';

        const stream = await llm.stream(messages, { signal: abortController.signal });

        await db.messages.add({
          id: messageId,
          threadId,
          role: 'ai',
          content: full,
          createdAt: Date.now(),
          done: false,
        });

        try {
          for await (const chunk of stream) {
            const delta = typeof chunk === 'string' ? chunk : chunk.content ?? '';
            full += delta;
            await db.messages.update(messageId, { content: full, done: false });

            port.postMessage({ delta });
          }
          port.postMessage({ done: true });
        } catch (err) {
          errorLog('MESSAGE_RUN_GRAPH_STREAM Stream error:', err);
          if (!abortController.signal.aborted) {
            try {
              port.postMessage({
                error: 'stream_error',
                message: (err as Error).message ?? String(err),
              });
            } catch (postError) {
              console.warn('포트가 이미 닫혀 있어 에러 메시지를 보낼 수 없습니다.');
            }
          }
        } finally {
          if (!abortController.signal.aborted) {
            await db.messages.update(messageId, { content: full, done: true });
          }
        }
      }
    });
  });
};
