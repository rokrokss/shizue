import ChatContainer from '@/components/Chat/ChatContainer';
import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import ThreadListModalContent from '@/components/Chat/ThreadListModalContent';
import TokenUsageModalContent from '@/components/Chat/TokenUsageModalContent';
import TopMenu from '@/components/Chat/TopRightMenu';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { MESSAGE_LOAD_THREAD } from '@/config/constants';
import { chatStatusAtom, isChatIdle, createThreadMessageCountAtom } from '@/hooks/chat';
import { ActionType, threadIdAtom } from '@/hooks/global';
import { useThemeValue } from '@/hooks/layout';
import { useChromePortStream } from '@/hooks/portStream';
import { convertFilesToBase64Array } from '@/lib/imageUtils';
import { addMessage, createThread, touchThread } from '@/lib/indexDB';
import { throttleTrailing } from '@/lib/throttleTrailing';
import { debugLog, errorLog } from '@/logs';
import { chatService } from '@/services/chatService';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface Message {
  role: 'human' | 'system' | 'ai';
  actionType: ActionType;
  summaryTitle?: string;
  summaryPageLink?: string;
  translateMode?: boolean;
  content: string;
  images?: string[];
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
}

const Chat = () => {
  const theme = useThemeValue();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStatus, setChatStatus] = useAtom(chatStatusAtom);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  const [threadId, setThreadId] = useAtom(threadIdAtom);
  const threadIdRef = useRef(threadId);
  const messageCountAtom = useMemo(() => createThreadMessageCountAtom(threadId), [threadId]);
  const messageCount = useAtomValue(messageCountAtom);
  const { startStream, startRetryStream, cancelStream } = useChromePortStream();

  const bottomRef = useRef<HTMLDivElement>(null);
  const aiIndexRef = useRef<number>(-1);
  const actionType = useRef<ActionType>('chat');

  const { t } = useTranslation();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToBottomThrottled = useMemo(
    () =>
      throttleTrailing(() => {
        scrollToBottom();
      }, 300),
    []
  );

  const handleTopMenuSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  const addAIMessage = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'ai',
        actionType: 'chat',
        content: '',
        done: false,
        onInterrupt: false,
        stopped: false,
      },
    ]);
  };

  const handleRequestFromContextMenu = useCallback(
    async (tId: string, requestedActionType: ActionType) => {
      debugLog('handleRequestFromContextMenu messages', messages);
      setChatStatus('waiting');

      actionType.current = requestedActionType;
      aiIndexRef.current = messages.length + 1;

      addAIMessage();

      scrollToBottomThrottled();

      startStream(
        { threadId: tId, actionType: actionType.current },
        {
          onDelta: (delta) =>
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content + delta,
                done: false,
                onInterrupt: false,
                stopped: copy[idx].stopped,
              };
              scrollToBottomThrottled();
              return copy;
            }),
          onDone: () => {
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content,
                done: true,
                onInterrupt: false,
                stopped: copy[idx].stopped,
              };
              return copy;
            });
            touchThread(tId);
            setChatStatus('idle');
            scrollToBottomThrottled();
          },
          onError: (err) => {
            errorLog('Chat Stream error:', err);
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content,
                done: false,
                onInterrupt: true,
                stopped: copy[idx].stopped,
              };
              return copy;
            });
            touchThread(tId);
            setChatStatus('idle');
            scrollToBottomThrottled();
          },
        }
      );
    },
    [messages, setChatStatus, startStream, scrollToBottomThrottled, setMessages, addAIMessage]
  );

  const loadThreadBackground = useCallback(
    async (tId: string) => {
      chrome.runtime
        .sendMessage({ action: MESSAGE_LOAD_THREAD, threadId: tId })
        .then((res: Message[]) => {
          setMessages(res);
          debugLog('loadThreadBackground set messages', messages);
          if (res.length > 0) {
            if (
              res[res.length - 1].actionType === 'askForSummary' ||
              res[res.length - 1].actionType === 'describeImage' ||
              res[res.length - 1].actionType === 'extractImageText'
            ) {
              handleRequestFromContextMenu(tId, res[res.length - 1].actionType);
            }
          }
        });
    },
    [handleRequestFromContextMenu]
  );

  const handleCancel = async () => {
    if (
      messages.length > 0 &&
      messages[messages.length - 1].role === 'ai' &&
      !messages[messages.length - 1].done
    ) {
      setMessages((cur) => {
        const idx = aiIndexRef.current;
        const copy = [...cur];
        copy[idx] = {
          role: 'ai',
          actionType: 'chat',
          content: copy[idx].content,
          done: false,
          onInterrupt: true,
          stopped: true,
        };
        return copy;
      });
    }
    cancelStream();
    chatService.cancelNotStartedMessage(threadId!);
    setChatStatus('idle');
    scrollToBottomThrottled();
  };

  const checkIfThreadExists = async (text: string) => {
    let tid = threadId;
    if (!tid) {
      tid = await createThread(text.slice(0, 20));
      setThreadId(tid);
    }
    return tid;
  };

  const addTranslateModeMessage = async (tId: string) => {
    const text = t('chat.translateModeDescription');

    setMessages((prev) => {
      actionType.current = 'chat';
      aiIndexRef.current = prev.length + 1;
      return [
        ...prev,
        {
          role: 'human',
          actionType: 'chat',
          content: text,
          done: true,
          onInterrupt: false,
          stopped: false,
          translateMode: true,
        },
        {
          role: 'ai',
          actionType: 'chat',
          content: '',
          done: false,
          onInterrupt: false,
          stopped: false,
        },
      ];
    });

    await addMessage({
      id: crypto.randomUUID(),
      threadId: tId,
      role: 'human',
      actionType: 'chat',
      content: text,
      createdAt: Date.now(),
      done: true,
      onInterrupt: false,
      stopped: false,
      translateMode: true,
    });
    await touchThread(tId);
  };

  const addHumanMessage = async (tId: string, text: string, images?: File[]) => {
    const imageBase64Array =
      images && images.length > 0 ? await convertFilesToBase64Array(images) : undefined;

    setMessages((prev) => {
      actionType.current = 'chat';
      aiIndexRef.current = prev.length + 1;
      return [
        ...prev,
        {
          role: 'human',
          actionType: 'chat',
          content: text,
          images: imageBase64Array,
          done: true,
          onInterrupt: false,
          stopped: false,
        },
        {
          role: 'ai',
          actionType: 'chat',
          content: '',
          done: false,
          onInterrupt: false,
          stopped: false,
        },
      ];
    });

    await addMessage({
      id: crypto.randomUUID(),
      threadId: tId,
      role: 'human',
      actionType: 'chat',
      content: text,
      images: imageBase64Array,
      createdAt: Date.now(),
      done: true,
      onInterrupt: false,
      stopped: false,
    });
    await touchThread(tId);
  };

  useEffect(() => {
    if (isChatIdle(chatStatus) && threadId) {
      cancelStream();
      loadThreadBackground(threadId);
    }

    if (!threadId) {
      cancelStream();
      setMessages([]);
    }
  }, [threadId]);

  useEffect(() => {
    threadIdRef.current = threadId;
    debugLog('threadId', threadId);
    debugLog('threadIdRef.current', threadIdRef.current);
  }, [threadId]);

  useEffect(() => {
    if (messageCount > 0 && threadId) {
      loadThreadBackground(threadId);
    }
  }, [messageCount, threadId, loadThreadBackground]);

  const handleSubmit = async (text: string, images?: File[]) => {
    setChatStatus('waiting');

    const tId = await checkIfThreadExists(text);

    await addHumanMessage(tId, text, images);
    scrollToBottomThrottled();

    startStream(
      { threadId: tId, actionType: actionType.current },
      {
        onDelta: (delta) =>
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content + delta,
              done: false,
              onInterrupt: false,
              stopped: copy[idx].stopped,
            };
            scrollToBottomThrottled();
            return copy;
          }),
        onDone: () => {
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content,
              done: true,
              onInterrupt: false,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
        onError: (err) => {
          errorLog('Chat Stream error:', err);
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content,
              done: false,
              onInterrupt: true,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
      }
    );
  };

  const handleRetry = async (messageIdxToRetry: number) => {
    if (!threadId) return;

    setChatStatus('waiting');

    actionType.current = messages[messageIdxToRetry - 1].actionType;
    aiIndexRef.current = messageIdxToRetry;

    setMessages((cur) => {
      const idx = aiIndexRef.current;
      const copy = [...cur];
      copy[idx] = {
        role: 'ai',
        actionType: 'chat',
        content: '',
        done: false,
        onInterrupt: false,
        stopped: false,
      };
      return copy;
    }),
      startRetryStream(
        {
          threadId,
          messageIdxToRetry: messageIdxToRetry,
          actionType: actionType.current,
        },
        {
          onDelta: (delta) =>
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content + delta,
                done: false,
                onInterrupt: false,
                stopped: copy[idx].stopped,
              };
              return copy;
            }),
          onDone: () => {
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content,
                done: true,
                onInterrupt: false,
                stopped: copy[idx].stopped,
              };
              return copy;
            });
            touchThread(threadId);
            setChatStatus('idle');
          },
          onError: (err) => {
            errorLog('Chat Stream error:', err);
            setMessages((cur) => {
              const idx = aiIndexRef.current;
              const copy = [...cur];
              copy[idx] = {
                role: 'ai',
                actionType: copy[idx].actionType,
                content: copy[idx].content,
                done: false,
                onInterrupt: true,
                stopped: copy[idx].stopped,
              };
              return copy;
            });
            touchThread(threadId);
            setChatStatus('idle');
          },
        }
      );
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
  };

  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };

  const handleNewChat = async () => {
    setThreadId(undefined);
  };

  const handleOpenUsage = () => {
    setIsUsageOpen(true);
  };

  const handleCloseUsage = () => {
    setIsUsageOpen(false);
  };

  const handleTranslateMode = async () => {
    setChatStatus('waiting');

    let tId = threadId;
    if (!tId) {
      tId = await createThread(t('chat.translateMode').slice(0, 20));
      setThreadId(tId);
    }

    await addTranslateModeMessage(tId);
    scrollToBottomThrottled();

    startStream(
      { threadId: tId, actionType: actionType.current },
      {
        onDelta: (delta) =>
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content + delta,
              done: false,
              onInterrupt: false,
              stopped: copy[idx].stopped,
            };
            scrollToBottomThrottled();
            return copy;
          }),
        onDone: () => {
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content,
              done: true,
              onInterrupt: false,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
        onError: (err) => {
          errorLog('Chat Stream error:', err);
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              actionType: copy[idx].actionType,
              content: copy[idx].content,
              done: false,
              onInterrupt: true,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
      }
    );
  };

  return (
    <div
      className={`sz-chat sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center ${
        theme == 'dark' ? 'sz:bg-[#1C1D26]' : 'sz:bg-white'
      }`}
    >
      <TopMenu onSettingsClick={handleTopMenuSettingsClick} />
      <div
        className="
        sz-chat-main
        sz:flex-1
        sz:flex
        sz:flex-col
        sz:items-center
        sz:justify-start
        sz:w-full
        sz:overflow-y-auto
        sz:scrollbar-hidden
      "
      >
        {/* **** aiIndexRef: {aiIndexRef.current} **** */}
        {threadId && messages.length > 0 ? (
          <ChatContainer
            messages={messages}
            onRetry={handleRetry}
            scrollToBottom={scrollToBottomThrottled}
          />
        ) : (
          <ChatGreeting />
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sz:w-full">
        <ChatInput
          chatStatus={chatStatus}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onOpenHistory={handleOpenHistory}
          onNewChat={handleNewChat}
          onOpenUsage={handleOpenUsage}
          onTranslateMode={handleTranslateMode}
        />
      </div>
      {isSettingsOpen && (
        <SidePanelFullModal
          onClose={closeSettings}
          size="base"
          minHeight="374px"
          content={<SettingsModalContent />}
        />
      )}
      {isHistoryOpen && (
        <SidePanelFullModal
          onClose={handleCloseHistory}
          size="large"
          content={<ThreadListModalContent onClose={handleCloseHistory} />}
        />
      )}
      {isUsageOpen && (
        <SidePanelFullModal
          onClose={handleCloseUsage}
          size="large"
          content={<TokenUsageModalContent />}
        />
      )}
    </div>
  );
};

export default Chat;
