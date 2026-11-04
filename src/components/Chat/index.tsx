import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import { DotCycle } from '@/components/Loader/DotCycle';
import TopMenu from '@/components/Chat/TopRightMenu';
import BackToPageButton from '@/components/Chat/BackToPageButton';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import SettingsModal from '@/components/Setting/SettingsModal';
import { isSelectionActionType, MESSAGE_LOAD_THREAD, MESSAGE_REMEMBER_THREAD } from '@/config/constants';
import { useAutoMemoryValue } from '@/hooks/autoMemory';
import { chatStatusAtom, createThreadMessageCountAtom, isChatIdle, switchThreadAtom } from '@/hooks/chat';
import { ActionType, threadIdAtom } from '@/hooks/global';
import { useThemeValue } from '@/hooks/layout';
import { useChromePortStream } from '@/hooks/portStream';
import { convertFilesToBase64Array } from '@/lib/imageUtils';
import {
  addMessage,
  createThread,
  deleteMessagesFrom,
  deleteThread,
  PageAttachment,
  touchThread,
  updateMessage,
} from '@/lib/indexDB';
import { hasPageLines } from '@/lib/pageLines';
import { getDetailedAnalysisPrompt } from '@/lib/prompts';
import { throttleTrailing } from '@/lib/throttleTrailing';
import { createThreadLoader } from '@/lib/threadLoader';
import type { AgentRun } from '@/lib/browserAgent';
import type { WebSource } from '@/lib/webSources';
import { debugLog, errorLog } from '@/logs';
import { chatService } from '@/services/chatService';
import { videoKey } from '@/lib/videoTranscript';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ChatContainer = lazy(() => import('@/components/Chat/ChatContainer'));
const ThreadListModalContent = lazy(() => import('@/components/Chat/ThreadListModalContent'));
const TokenUsageModalContent = lazy(() => import('@/components/Chat/TokenUsageModalContent'));

export interface Message {
  // The stored message's id. An answer the panel is still showing as it streams has none.
  id?: string;
  role: 'human' | 'system' | 'ai';
  actionType: ActionType;
  summaryTitle?: string;
  summaryPageLink?: string;
  summaryVideo?: boolean;
  summaryCaptions?: boolean;
  summaryStoryboard?: string;
  summaryMode?: 'detailed';
  selectionText?: string;
  translateMode?: boolean;
  content: string;
  images?: string[];
  attachments?: PageAttachment[];
  webSearch?: boolean;
  sources?: WebSource[];
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
  errorMessage?: string;
  contextTruncated?: boolean;
  reasoning?: string;
  thinkingMs?: number;
  suggestions?: string[];
  videoMoment?: { video: string; seconds: number };
  contextUsage?: number;
  contextCompacted?: boolean;
  browserAgent?: boolean;
  autoApprove?: boolean;
  agentRun?: AgentRun;
  browserControlHint?: boolean;
}

// The asking moment of a video, kept with a question (see ChatInput).
export type VideoMoment = { video: string; seconds: number };

const Chat = () => {
  const theme = useThemeValue();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesThreadId, setMessagesThreadId] = useState<string>();
  const [chatStatus, setChatStatus] = useAtom(chatStatusAtom);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  const [threadId, setThreadId] = useAtom(threadIdAtom);
  const switchThread = useSetAtom(switchThreadAtom);
  const store = useStore();
  const threadLoader = useMemo(() => createThreadLoader<Message[]>((id) =>
    chrome.runtime.sendMessage({ action: MESSAGE_LOAD_THREAD, threadId: id })
  ), []);
  const messageCountAtom = useMemo(() => createThreadMessageCountAtom(threadId), [threadId]);
  const messageCount = useAtomValue(messageCountAtom);
  const prevMessageCountRef = useRef(messageCount);
  const { startStream, startRetryStream, cancelStream, answerAgentApproval } = useChromePortStream();
  const autoMemoryEnabled = useAutoMemoryValue().enabled;

  const bottomRef = useRef<HTMLDivElement>(null);
  const aiIndexRef = useRef<number>(-1);
  const actionType = useRef<ActionType>('chat');

  const { t } = useTranslation();

  // An answer keeps the chat's end in view while the reader is there. Scrolling up to read stops
  // that, and scrolling back down to the end, a new question or another chat starts it again.
  const followRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const scrollToBottom = useCallback(() => {
    if (followRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  // Only the reader scrolls up: following scrolls down, and a chat that gets shorter while at its
  // end stays at its end.
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 8) followRef.current = true;
    else if (box.scrollTop < lastScrollTopRef.current) followRef.current = false;
    lastScrollTopRef.current = box.scrollTop;
  };

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

  const markBrowserControlHint = () =>
    setMessages((cur) => updateAIMessage(cur, { browserControlHint: true }));

  const showSources = (sources: WebSource[]) =>
    setMessages((cur) => updateAIMessage(cur, { sources }));

  const appendReasoning = (delta: string) => {
    setMessages((cur) =>
      updateAIMessage(cur, { reasoning: (cur[aiIndexRef.current]?.reasoning ?? '') + delta })
    );
    scrollToBottomThrottled();
  };

  const markThinkingMs = (thinkingMs: number) =>
    setMessages((cur) => updateAIMessage(cur, { thinkingMs }));

  const showAgentRun = (agentRun: AgentRun) => {
    setMessages((cur) => updateAIMessage(cur, { agentRun }));
    scrollToBottomThrottled();
  };

  // What the browser agent's pill on the page says.
  const agentLabels = () => ({
    working: t('agent.overlayWorking'),
    waiting: t('agent.overlayWaiting'),
    stop: t('agent.overlayStop'),
  });

  const markContextUsage = (contextUsage: number, compacted: boolean) =>
    setMessages((cur) =>
      updateAIMessage(cur, { contextUsage, ...(compacted ? { contextCompacted: true } : {}) })
    );

  // A summary that just finished offers questions to ask next, a moment later.
  const requestSuggestions = async (tId: string) => {
    const index = aiIndexRef.current;
    const suggestions = await chatService.suggestQuestions(tId).catch(() => []);
    if (suggestions.length === 0 || store.get(threadIdAtom) !== tId) return;
    setMessages((cur) =>
      cur[index]?.role === 'ai' && cur[index].done ? updateAIMessage(cur, { suggestions }) : cur
    );
  };

  const handleRequestFromContextMenu = useCallback(
    async (tId: string, requestedActionType: ActionType) => {
      debugLog('handleRequestFromContextMenu called');
      threadLoader.invalidate();
      setChatStatus('waiting');

      actionType.current = requestedActionType;
      debugLog('handleRequestFromContextMenu addAIMessage');
      addAIMessage();

      followRef.current = true;
      scrollToBottomThrottled();

      startStream(
        { threadId: tId, actionType: actionType.current },
        {
          onContextTruncated: markContextTruncated,
          onReasoning: appendReasoning,
          onThinkingMs: markThinkingMs,
          onContextUsage: markContextUsage,
          onSources: showSources,
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
            if (requestedActionType === 'askForSummary') void requestSuggestions(tId);
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
    [setChatStatus, startStream, scrollToBottomThrottled, setMessages, addAIMessage, threadLoader]
  );

  const loadThreadBackground = useCallback(
    async (tId: string) => {
      debugLog('loadThreadBackground called with threadId:', tId);
      await threadLoader.load(tId)
        .then((res) => {
          if (!Array.isArray(res) || store.get(threadIdAtom) !== tId ||
              !isChatIdle(store.get(chatStatusAtom))) return;
          setMessagesThreadId(tId);
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
        .catch((error) => {
          errorLog('Unable to load chat thread', error);
        });
    },
    [handleRequestFromContextMenu, store, threadLoader]
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
    const id = crypto.randomUUID();

    setMessagesThreadId(tId);
    setMessages((prev) => {
      if (messagesThreadId !== tId) prev = [];
      actionType.current = 'chat';
      // human 메시지 + AI 메시지를 추가하므로 AI 메시지는 prev.length + 1 위치
      aiIndexRef.current = prev.length + 1;
      return [
        ...prev,
        {
          id,
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
      id,
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

  const addHumanMessage = async (
    tId: string,
    text: string,
    images?: File[],
    attachments?: PageAttachment[],
    webSearch?: boolean,
    videoMoment?: VideoMoment,
    browserAgent?: boolean,
    autoApprove?: boolean
  ) => {
    const imageBase64Array =
      images && images.length > 0 ? await convertFilesToBase64Array(images) : undefined;
    const id = crypto.randomUUID();

    setMessagesThreadId(tId);
    setMessages((prev) => {
      if (messagesThreadId !== tId) prev = [];
      actionType.current = 'chat';
      // human 메시지 + AI 메시지를 추가하므로 AI 메시지는 prev.length + 1 위치
      aiIndexRef.current = prev.length + 1;
      return [
        ...prev,
        {
          id,
          role: 'human',
          actionType: 'chat',
          content: text,
          images: imageBase64Array,
          attachments,
          ...(webSearch ? { webSearch } : {}),
          ...(videoMoment ? { videoMoment } : {}),
          ...(browserAgent ? { browserAgent } : {}),
          ...(autoApprove ? { autoApprove } : {}),
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
      id,
      threadId: tId,
      role: 'human',
      actionType: 'chat',
      content: text,
      images: imageBase64Array,
      attachments,
      ...(webSearch ? { webSearch } : {}),
      ...(videoMoment ? { videoMoment } : {}),
      ...(browserAgent ? { browserAgent } : {}),
      ...(autoApprove ? { autoApprove } : {}),
      createdAt: Date.now(),
      done: true,
      onInterrupt: false,
      stopped: false,
    });
    await touchThread(tId);
  };

  // Auto memory reads a chat once the user moves on from it: to another chat, a new one, or by
  // closing the side panel.
  const shownThreadRef = useRef(threadId);
  const autoMemoryRef = useRef(autoMemoryEnabled);
  autoMemoryRef.current = autoMemoryEnabled;
  const rememberThread = (id: string) => {
    if (autoMemoryRef.current) {
      chrome.runtime.sendMessage({ action: MESSAGE_REMEMBER_THREAD, threadId: id }).catch(() => {});
    }
  };

  useEffect(() => {
    const left = shownThreadRef.current;
    shownThreadRef.current = threadId;
    if (left && left !== threadId) rememberThread(left);
  }, [threadId]);

  useEffect(() => {
    const handlePageHide = () => {
      if (shownThreadRef.current) rememberThread(shownThreadRef.current);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  useEffect(() => {
    followRef.current = true;
    if (isChatIdle(chatStatus) && threadId) {
      cancelStream();
      loadThreadBackground(threadId);
    }

    if (!threadId) {
      cancelStream();
      setMessages([]);
      setMessagesThreadId(undefined);
    }
    return () => threadLoader.invalidate();
  }, [threadId]);

  useEffect(() => {
    // Only load thread when messageCount actually increases (new message from outside)
    if (isChatIdle(chatStatus) && messageCount > 0 && threadId && messageCount > prevMessageCountRef.current) {
      loadThreadBackground(threadId);
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount, threadId]);

  // The video whose captions the chat last read (a summary of it, or it alone attached), for asking
  // about the moment it is at.
  const threadVideo = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'human') continue;
      if (m.actionType === 'askForSummary' && m.summaryCaptions) return videoKey(m.summaryPageLink);
      const videos = (m.attachments ?? []).filter((page) => page.captions);
      if (videos.length === 1) return videoKey(videos[0].url);
    }
    return null;
  }, [messages]);

  // How full the model's context was for the latest answer.
  const contextUsage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'ai') return messages[i].contextUsage ?? null;
    }
    return null;
  }, [messages]);

  const threadPageUrls = useMemo(
    () =>
      messages.flatMap((m) => [
        ...(m.attachments?.map((page) => page.url) ?? []),
        ...(m.actionType === 'askForSummary' && m.summaryPageLink ? [m.summaryPageLink] : []),
      ]),
    [messages]
  );

  // Questions typed in this chat, for the chat box's ↑ recall.
  const previousPrompts = useMemo(
    () =>
      messages.flatMap((m) =>
        m.role === 'human' && m.actionType === 'chat' && !m.translateMode && m.content
          ? [m.content]
          : []
      ),
    [messages]
  );

  const handleSubmit = async (
    text: string,
    images?: File[],
    attachments?: PageAttachment[],
    webSearch?: boolean,
    videoMoment?: VideoMoment,
    browserAgent?: boolean,
    autoApprove?: boolean
  ) => {
    threadLoader.invalidate();
    setChatStatus('waiting');

    const tId = await checkIfThreadExists(text);

    await addHumanMessage(tId, text, images, attachments, webSearch, videoMoment, browserAgent, autoApprove);
    followRef.current = true;
    scrollToBottomThrottled();

    startStream(
      { threadId: tId, actionType: actionType.current, ...(browserAgent ? { agentLabels: agentLabels() } : {}) },
      {
        onAgent: showAgentRun,
        onBrowserControlHint: markBrowserControlHint,
        onContextTruncated: markContextTruncated,
        onReasoning: appendReasoning,
        onThinkingMs: markThinkingMs,
        onContextUsage: markContextUsage,
        onSources: showSources,
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

  // browserAgent: run the question with the browser agent this time (the hint's button).
  const handleRetry = async (messageIdxToRetry: number, browserAgent?: boolean) => {
    if (!threadId) return;

    threadLoader.invalidate();
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
      sources: undefined,
      reasoning: undefined,
      thinkingMs: undefined,
      contextUsage: undefined,
      contextCompacted: undefined,
      agentRun: undefined,
      browserControlHint: undefined,
    })),
      startRetryStream(
        {
          threadId,
          messageIdxToRetry: messageIdxToRetry,
          actionType: actionType.current,
          ...((browserAgent ?? messages[messageIdxToRetry - 1]?.browserAgent) ? { agentLabels: agentLabels() } : {}),
        },
        {
          onAgent: showAgentRun,
          onBrowserControlHint: markBrowserControlHint,
          onContextTruncated: markContextTruncated,
          onReasoning: appendReasoning,
          onThinkingMs: markThinkingMs,
          onContextUsage: markContextUsage,
          onSources: showSources,
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

  // Bumped when the hint under an answer turns browser control on, for the chat box's toggle.
  const [browserAgentTurnedOn, setBrowserAgentTurnedOn] = useState(0);

  // The hint under an answer that was asked to act in the tab with browser control off: turns it on
  // and asks the question again with the browser agent, which the background reads off the question.
  const handleBrowserControlRetry = async (answerIdx: number) => {
    const question = messages[answerIdx - 1];
    if (!question?.id) return;
    await updateMessage(question.id, { browserAgent: true });
    setMessages((cur) => cur.map((m, i) => (i === answerIdx - 1 ? { ...m, browserAgent: true } : m)));
    setBrowserAgentTurnedOn((count) => count + 1);
    await handleRetry(answerIdx, true);
  };

  // Asks for the detailed analysis of what the summary before `answerIdx` read, with web research
  // when `research`. The chat already holds the text, so the request carries only the prompt; once
  // stored, the summary request it is starts its answer like one from the page (loadThreadBackground).
  const handleDetailedAnalysis = async (answerIdx: number, research: boolean) => {
    const request = messages[answerIdx - 1];
    if (!threadId || !request) return;
    const refs = request.summaryCaptions ? 'time' : hasPageLines(request.content) ? 'line' : null;
    await addMessage({
      id: crypto.randomUUID(),
      threadId,
      role: 'human',
      actionType: 'askForSummary',
      summaryTitle: request.summaryTitle,
      summaryPageLink: request.summaryPageLink,
      summaryVideo: request.summaryVideo,
      summaryCaptions: request.summaryCaptions,
      ...(request.summaryStoryboard ? { summaryStoryboard: request.summaryStoryboard } : {}),
      summaryMode: 'detailed',
      ...(research ? { webSearch: true } : {}),
      translateMode: false,
      content: getDetailedAnalysisPrompt(!!request.summaryCaptions, refs, research),
      createdAt: Date.now(),
      done: true,
      onInterrupt: false,
      stopped: false,
    });
    await touchThread(threadId);
  };

  // Deletes a sent message and everything after it, since each later answer read it. Deleting the
  // first message deletes the chat, before leaving it so auto memory doesn't read what was deleted.
  const handleDeleteFrom = async (idx: number) => {
    const id = messages[idx]?.id;
    if (!threadId || !id || !isChatIdle(chatStatus)) return;
    threadLoader.invalidate();
    if (idx === 0) {
      await deleteThread(threadId);
      switchThread(undefined);
      return;
    }
    await deleteMessagesFrom(threadId, id);
    setMessages((cur) => cur.slice(0, idx));
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
  };

  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };

  const handleNewChat = async () => {
    switchThread(undefined);
  };

  const handleOpenUsage = () => {
    setIsUsageOpen(true);
  };

  const handleCloseUsage = () => {
    setIsUsageOpen(false);
  };

  const handleTranslateMode = async () => {
    threadLoader.invalidate();
    setChatStatus('waiting');

    let tId = threadId;
    if (!tId) {
      tId = await createThread(t('chat.translateMode').slice(0, 20));
      setThreadId(tId);
    }

    await addTranslateModeMessage(tId);
    followRef.current = true;
    scrollToBottomThrottled();

    startStream(
      { threadId: tId, actionType: actionType.current },
      {
        onContextTruncated: markContextTruncated,
        onReasoning: appendReasoning,
        onThinkingMs: markThinkingMs,
        onContextUsage: markContextUsage,
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
      <BackToPageButton />
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
        onScroll={handleScroll}
      >
        {/* **** aiIndexRef: {aiIndexRef.current} **** */}
        {threadId && messagesThreadId !== threadId ? (
          <div className="sz:pt-15" aria-busy="true"><DotCycle /></div>
        ) : threadId && messages.length > 0 ? (
          <Suspense fallback={<div className="sz:pt-15" aria-busy="true"><DotCycle /></div>}>
            <ChatContainer
              key={threadId}
              messages={messages}
              onRetry={handleRetry}
              onDelete={handleDeleteFrom}
              onDetailedAnalysis={handleDetailedAnalysis}
              onAsk={(question) => void handleSubmit(question)}
              onAgentApproval={answerAgentApproval}
              onBrowserControl={(answerIdx) => void handleBrowserControlRetry(answerIdx)}
              scrollToBottom={scrollToBottomThrottled}
            />
          </Suspense>
        ) : (
          <ChatGreeting />
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sz:w-full">
        <ChatInput
          chatStatus={chatStatus}
          threadPageUrls={threadPageUrls}
          threadVideo={threadVideo}
          contextUsage={contextUsage}
          previousPrompts={previousPrompts}
          browserAgentTurnedOn={browserAgentTurnedOn}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onOpenHistory={handleOpenHistory}
          onNewChat={handleNewChat}
          onOpenUsage={handleOpenUsage}
          onTranslateMode={handleTranslateMode}
        />
      </div>
      {isSettingsOpen && (
        <SettingsModal onClose={closeSettings} />
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
