import {
  MESSAGE_OPEN_PANEL,
  MESSAGE_PANEL_OPENED_PING_FROM_PANEL,
  MESSAGE_RUN_GRAPH_STREAM,
  MESSAGE_SET_PANEL_OPEN_OR_NOT,
  MESSAGE_UPDATE_PANEL_INIT_DATA,
  PORT_LISTEN_PANEL_CLOSED_KEY,
  PORT_STREAM_MESSAGE,
  STORAGE_SETTINGS,
  STREAM_FLUSH_THRESHOLD_0,
  STREAM_FLUSH_THRESHOLD_1,
} from '@/config/constants';
import { getCurrentLanguage } from '@/entrypoints/background/language';
import { loadUserMemory } from '@/hooks/userMemory';
import { db, loadThread } from '@/lib/indexDB';
import { getInitialAIMessage, getInitialSystemMessage } from '@/lib/prompts';
import { debugLog, errorLog } from '@/logs';
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

export const sidebarToggleListeners = () => {
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

export const sidePanelMessageListeners = () => {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_STREAM_MESSAGE) return;

    const abortController = new AbortController();

    port.onDisconnect.addListener(() => {
      abortController.abort();
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.action === MESSAGE_RUN_GRAPH_STREAM) {
        const { threadId } = msg;

        // test
        const messageId = crypto.randomUUID();

        const thread = await loadThread(threadId);

        await db.messages.add({
          id: messageId,
          threadId,
          role: 'ai',
          content: '',
          createdAt: Date.now(),
          done: false,
          onInterrupt: false,
          stopped: false,
        });

        let full = '';
        let buffer = '';

        const memory = (await loadUserMemory()).text;

        const initialAIMessage = getInitialAIMessage(getCurrentLanguage());
        const initialSystemMessage = getInitialSystemMessage(getCurrentLanguage());

        const messages = [
          new SystemMessage(initialSystemMessage),
          new AIMessage(initialAIMessage),
          ...thread.map((m) =>
            m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content)
          ),
        ];

        const sendIfFull = async () => {
          const threshold = full ? STREAM_FLUSH_THRESHOLD_1 : STREAM_FLUSH_THRESHOLD_0;
          if (buffer.length >= threshold) {
            full += buffer;
            await db.messages.update(messageId, { content: full, done: false });
            port.postMessage({ delta: buffer });
            buffer = '';
          }
        };

        const llm = new ChatOpenAI({
          modelName: 'gpt-4.1',
          temperature: 0.7,
          apiKey: await chrome.storage.local
            .get(STORAGE_SETTINGS)
            .then((v) => v[STORAGE_SETTINGS].openAIKey),
        });

        debugLog('Stream llm start with messages: ', thread);

        const stream = await llm.stream(messages, { signal: abortController.signal });

        try {
          for await (const chunk of stream) {
            const delta = typeof chunk === 'string' ? chunk : chunk.content ?? '';
            buffer += delta;
            await sendIfFull();
          }
          if (buffer) {
            full += buffer;
            port.postMessage({ delta: buffer });
          }
          port.postMessage({ done: true });
        } catch (err) {
          if (!abortController.signal.aborted) {
            errorLog('MESSAGE_RUN_GRAPH_STREAM Stream error:', err);
            try {
              port.postMessage({
                error: 'stream_error',
                message: (err as Error).message ?? String(err),
              });
            } catch (postError) {
              errorLog('port is already closed: ', postError);
            } finally {
              await db.messages.update(messageId, { content: full, onInterrupt: true });
            }
          }
        } finally {
          if (!abortController.signal.aborted) {
            await db.messages.update(messageId, { content: full, done: true });
          } else {
            await db.messages.update(messageId, { content: full, stopped: true });
          }
        }
      }
    });
  });
};
