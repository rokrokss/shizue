import ChatContainer from '@/components/Chat/ChatContainer';
import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import ThreadListModalContent from '@/components/Chat/ThreadListModalContent';
import TokenUsageModalContent from '@/components/Chat/TokenUsageModalContent';
import TopMenu from '@/components/Chat/TopRightMenu';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModalContent from '@/components/Setting/SettingsModalContent';
import { isSelectionActionType, MESSAGE_LOAD_THREAD } from '@/config/constants';
import { chatStatusAtom, createThreadMessageCountAtom, isChatIdle } from '@/hooks/chat';
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
  selectionText?: string;
  translateMode?: boolean;
  content: string;
  images?: string[];
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
  errorMessage?: string;
  contextTruncated?: boolean;
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
  const prevMessageCountRef = useRef(messageCount);
  const { startStream, startRetryStream, cancelStream } = useChromePortStream();

  const bottomRef = useRef<HTMLDivElement>(null);
  const aiIndexRef = useRef<number>(-1);
  const actionType = useRef<ActionType>('chat');
  const isLoadingThreadRef = useRef(false);

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
    setMessages((prev) => {
      aiIndexRef.current = prev.length;
      return [
        ...prev,
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
  };

  const updateAIMessage = (cur: Message[], updates: Partial<Message>) => {
    const idx = aiIndexRef.current;
    const copy = [...cur];
    
    // copy[idx]가 없으면 새로운 AI 메시지 객체 생성
    if (!copy[idx]) {
      copy[idx] = {
        role: 'ai',
        actionType: actionType.current || 'chat',
        content: '',
        done: false,
        onInterrupt: false,
        stopped: false,
        ...updates,
      };
    } else {
      // 기존 메시지 업데이트
      copy[idx] = {
        ...copy[idx],
        ...updates,
        // 특정 필드들은 기본값 보장
        actionType: updates.actionType || copy[idx].actionType || actionType.current || 'chat',
        content: updates.content !== undefined ? updates.content : copy[idx].content || '',
        stopped: updates.stopped !== undefined ? updates.stopped : copy[idx].stopped || false,
      };
    }
    
    return copy;
  };

  const markContextTruncated = () =>
    setMessages((cur) => updateAIMessage(cur, { contextTruncated: true }));

  const handleRequestFromContextMenu = useCallback(
    async (tId: string, requestedActionType: ActionType) => {
      debugLog('handleRequestFromContextMenu called');
      setChatStatus('waiting');

      actionType.current = requestedActionType;
      debugLog('handleRequestFromContextMenu addAIMessage');
      addAIMessage();

      scrollToBottomThrottled();

      startStream(
        { threadId: tId, actionType: actionType.current },
        {
          onContextTruncated: markContextTruncated,
          onDelta: (delta) => {
            setMessages((cur) => {
              const updatedMessages = updateAIMessage(cur, {
                content: (cur[aiIndexRef.current]?.content || '') + delta,
                done: false,
                onInterrupt: false,
              });
              return updatedMessages;
            });
            scrollToBottomThrottled();
          },
          onDone: () => {
            setMessages((cur) =>
              updateAIMessage(cur, {
                done: true,
                onInterrupt: false,
              })
            );
            touchThread(tId);
            setChatStatus('idle');
            scrollToBottomThrottled();
          },
          onError: (err) => {
            errorLog('Chat Stream error:', err);
            setMessages((cur) =>
              updateAIMessage(cur, {
                done: false,
                onInterrupt: true,
                errorMessage: err,
              })
            );
            touchThread(tId);
            setChatStatus('idle');
            scrollToBottomThrottled();
          },
        }
      );
    },
    [setChatStatus, startStream, scrollToBottomThrottled, setMessages, addAIMessage]
  );

  const loadThreadBackground = useCallback(
    async (tId: string) => {
      if (isLoadingThreadRef.current) {
        debugLog('loadThreadBackground skipped - already loading');
        return;
      }
      isLoadingThreadRef.current = true;
      debugLog('loadThreadBackground called with threadId:', tId);
      chrome.runtime
        .sendMessage({ action: MESSAGE_LOAD_THREAD, threadId: tId })
        .then((res: Message[]) => {
          if (!Array.isArray(res)) return;
          setMessages(res);
          debugLog('loadThreadBackground set messages', res);
          if (res.length > 0) {
            const lastMessage = res[res.length - 1];
            // Check if the last message is a human message that needs an AI response
            if (
              lastMessage.role === 'human' &&
              (lastMessage.actionType === 'askForSummary' ||
                lastMessage.actionType === 'describeImage' ||
                lastMessage.actionType === 'extractImageText' ||
                isSelectionActionType(lastMessage.actionType))
            ) {
              // Only trigger AI response if the last message is the human message
              // (no AI message exists yet)
              handleRequestFromContextMenu(tId, lastMessage.actionType);
            }
          }
        })
        .finally(() => {
          isLoadingThreadRef.current = false;
        });
    },
    [handleRequestFromContextMenu, setMessages]
  );

  const handleCancel = async () => {
    if (
      messages.length > 0 &&
      messages[messages.length - 1].role === 'ai' &&
      !messages[messages.length - 1].done
    ) {
      setMessages((cur) => updateAIMessage(cur, {
        done: false,
        onInterrupt: true,
        stopped: true,
      }));
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
      // human 메시지 + AI 메시지를 추가하므로 AI 메시지는 prev.length + 1 위치
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
      // human 메시지 + AI 메시지를 추가하므로 AI 메시지는 prev.length + 1 위치
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
    // Only load thread when messageCount actually increases (new message from outside)
    if (messageCount > 0 && threadId && messageCount > prevMessageCountRef.current) {
      loadThreadBackground(threadId);
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount, threadId]);

  const handleSubmit = async (text: string, images?: File[]) => {
    setChatStatus('waiting');

    const tId = await checkIfThreadExists(text);

    await addHumanMessage(tId, text, images);
    scrollToBottomThrottled();

    startStream(
      { threadId: tId, actionType: actionType.current },
      {
        onContextTruncated: markContextTruncated,
        onDelta: (delta) =>
          setMessages((cur) => {
            const updatedMessages = updateAIMessage(cur, {
              content: (cur[aiIndexRef.current]?.content || '') + delta,
              done: false,
              onInterrupt: false,
            });
            scrollToBottomThrottled();
            return updatedMessages;
          }),
        onDone: () => {
          setMessages((cur) =>
            // The AI slot may not exist yet if the stream ends before the first delta.
            updateAIMessage(cur, { done: true, onInterrupt: false })
          );
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
        onError: (err) => {
          errorLog('Chat Stream error:', err);
          setMessages((cur) =>
            // The AI slot may not exist yet if the request fails before the first delta.
            updateAIMessage(cur, { done: false, onInterrupt: true, errorMessage: err })
          );
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

    setMessages((cur) => updateAIMessage(cur, {
      actionType: 'chat',
      content: '',
      done: false,
      onInterrupt: false,
      stopped: false,
      errorMessage: undefined,
      contextTruncated: undefined,
    })),
      startRetryStream(
        {
          threadId,
          messageIdxToRetry: messageIdxToRetry,
          actionType: actionType.current,
        },
        {
          onContextTruncated: markContextTruncated,
          onDelta: (delta) =>
            setMessages((cur) => {
              const updatedMessages = updateAIMessage(cur, {
                content: (cur[aiIndexRef.current]?.content || '') + delta,
                done: false,
                onInterrupt: false,
              });
              return updatedMessages;
            }),
          onDone: () => {
            setMessages((cur) => updateAIMessage(cur, {
              done: true,
              onInterrupt: false,
            }));
            touchThread(threadId);
            setChatStatus('idle');
          },
          onError: (err) => {
            errorLog('Chat Stream error:', err);
            setMessages((cur) => updateAIMessage(cur, {
              done: false,
              onInterrupt: true,
              errorMessage: err,
            }));
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
        onContextTruncated: markContextTruncated,
        onDelta: (delta) =>
          setMessages((cur) => {
            const updatedMessages = updateAIMessage(cur, {
              content: (cur[aiIndexRef.current]?.content || '') + delta,
              done: false,
              onInterrupt: false,
            });
            scrollToBottomThrottled();
            return updatedMessages;
          }),
        onDone: () => {
          setMessages((cur) =>
            // The AI slot may not exist yet if the stream ends before the first delta.
            updateAIMessage(cur, { done: true, onInterrupt: false })
          );
          touchThread(tId);
          setChatStatus('idle');
          scrollToBottomThrottled();
        },
        onError: (err) => {
          errorLog('Chat Stream error:', err);
          setMessages((cur) =>
            // The AI slot may not exist yet if the request fails before the first delta.
            updateAIMessage(cur, { done: false, onInterrupt: true, errorMessage: err })
          );
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
