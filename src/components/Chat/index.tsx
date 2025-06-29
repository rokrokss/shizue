import ChatContainer from '@/components/Chat/ChatContainer';
import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import ThreadListModalContent from '@/components/Chat/ThreadListModalContent';
import TokenUsageModalContent from '@/components/Chat/TokenUsageModalContent';
import TopMenu from '@/components/Chat/TopRightMenu';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { MESSAGE_LOAD_THREAD } from '@/config/constants';
import { chatStatusAtom, isChatIdle } from '@/hooks/chat';
import { ActionType, messageAddedInPanelAtom, threadIdAtom } from '@/hooks/global';
import { useThemeValue } from '@/hooks/layout';
import { useChromePortStream } from '@/hooks/portStream';
import { addMessage, createThread, touchThread } from '@/lib/indexDB';
import { throttleTrailing } from '@/lib/throttleTrailing';
import { debugLog, errorLog } from '@/logs';
import { chatService } from '@/services/chatService';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Message {
  role: 'human' | 'system' | 'ai';
  actionType: ActionType;
  summaryTitle?: string;
  summaryPageLink?: string;
  content: string;
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
  const messageAddedTimestamp = useAtomValue(messageAddedInPanelAtom);
  const { startStream, startRetryStream, cancelStream } = useChromePortStream();

  const bottomRef = useRef<HTMLDivElement>(null);
  const aiIndexRef = useRef<number>(-1);
  const actionType = useRef<ActionType>('chat');

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

  const handleAskForSummary = async (tId: string) => {
    debugLog('handleAskForSummary messages', messages);
    setChatStatus('waiting');

    actionType.current = 'askForSummary';
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
  };

  const loadThreadBackground = useCallback(
    async (tId: string) => {
      chrome.runtime
        .sendMessage({ action: MESSAGE_LOAD_THREAD, threadId: tId })
        .then((res: Message[]) => {
          setMessages(res);
          if (res.length > 0 && res[res.length - 1].actionType === 'askForSummary') {
            handleAskForSummary(tId);
          }
        });
    },
    [setMessages, handleAskForSummary]
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

  const addHumanMessage = async (tId: string, text: string) => {
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
    });
    await touchThread(tId);
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
    if (messageAddedTimestamp) {
      const currentThreadId = threadIdRef.current;
      if (currentThreadId) {
        loadThreadBackground(currentThreadId);
      }
    }
  }, [messageAddedTimestamp]);

  const handleSubmit = async (text: string) => {
    setChatStatus('waiting');

    const tId = await checkIfThreadExists(text);

    await addHumanMessage(tId, text);
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
