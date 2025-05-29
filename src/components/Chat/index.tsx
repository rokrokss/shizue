import ChatContainer from '@/components/Chat/ChatContainer';
import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import SettingsModalContent from '@/components/Chat/SettingsModalContent';
import ThreadListModalContent from '@/components/Chat/ThreadListModalContent';
import TopMenu from '@/components/Chat/TopRightMenu';
import SidePanelFullModal from '@/components/Modal/SidePanelFullModal';
import { MESSAGE_CANCEL_NOT_STARTED_MESSAGE, MESSAGE_LOAD_THREAD } from '@/config/constants';
import { currentThreadIdAtom } from '@/hooks/chat';
import { useChromePortStream } from '@/hooks/portStream';
import { addMessage, createThread, touchThread } from '@/lib/indexDB';
import { throttleTrailing } from '@/lib/throttleTrailing';
import { errorLog } from '@/logs';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Message {
  role: 'human' | 'system' | 'ai';
  content: string;
  done: boolean;
  onInterrupt: boolean;
  stopped: boolean;
}

const Chat = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [threadId, setThreadId] = useAtom(currentThreadIdAtom);
  const { startStream, cancelStream } = useChromePortStream();

  const bottomRef = useRef<HTMLDivElement>(null);
  const aiIndexRef = useRef<number>(-1);

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

  const loadThreadBackground = useCallback(async (threadId: string) => {
    chrome.runtime.sendMessage({ action: MESSAGE_LOAD_THREAD, threadId }).then((res: Message[]) => {
      setMessages(res);
    });
  }, []);

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
          content: copy[idx].content,
          done: false,
          onInterrupt: true,
          stopped: true,
        };
        return copy;
      });
    }
    cancelStream();
    void chrome.runtime.sendMessage({
      action: MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
      threadId,
    });
    setIsWaitingForResponse(false);
    scrollToBottomThrottled();
  };

  const checkIfThreadExists = async (text: string) => {
    let id = threadId;
    if (!id) {
      id = await createThread(text.slice(0, 20));
      setThreadId(id);
    }
    return id;
  };

  const addHumanMessage = async (threadId: string, text: string) => {
    setMessages((prev) => {
      aiIndexRef.current = prev.length + 1;
      return [
        ...prev,
        { role: 'human', content: text, done: true, onInterrupt: false, stopped: false },
        { role: 'ai', content: '', done: false, onInterrupt: false, stopped: false },
      ];
    });

    await addMessage({
      id: crypto.randomUUID(),
      threadId: threadId,
      role: 'human',
      content: text,
      createdAt: Date.now(),
      done: true,
      onInterrupt: false,
      stopped: false,
    });
    await touchThread(threadId);
  };

  useEffect(() => {
    if (!isWaitingForResponse && threadId) {
      cancelStream();
      loadThreadBackground(threadId);
    }

    if (!threadId) {
      cancelStream();
      setMessages([]);
    }
  }, [threadId]);

  const handleSubmit = async (text: string) => {
    setIsWaitingForResponse(true);

    const id = await checkIfThreadExists(text);

    await addHumanMessage(id, text);
    scrollToBottomThrottled();

    startStream(
      { threadId: id },
      {
        onDelta: (delta) =>
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
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
              content: copy[idx].content,
              done: true,
              onInterrupt: false,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(id);
          setIsWaitingForResponse(false);
          scrollToBottomThrottled();
        },
        onError: (err) => {
          errorLog('Chat Stream error:', err);
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = {
              role: 'ai',
              content: copy[idx].content,
              done: false,
              onInterrupt: true,
              stopped: copy[idx].stopped,
            };
            return copy;
          });
          touchThread(id);
          setIsWaitingForResponse(false);
          scrollToBottomThrottled();
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

  return (
    <div className="sz-chat sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center">
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
          <ChatContainer messages={messages} scrollToBottom={scrollToBottomThrottled} />
        ) : (
          <ChatGreeting />
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sz:w-full">
        <ChatInput
          isWaitingForResponse={isWaitingForResponse}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onOpenHistory={handleOpenHistory}
          onNewChat={handleNewChat}
        />
      </div>
      {isSettingsOpen && (
        <SidePanelFullModal onClose={closeSettings} content={<SettingsModalContent />} />
      )}
      {isHistoryOpen && (
        <SidePanelFullModal
          onClose={handleCloseHistory}
          content={<ThreadListModalContent onClose={handleCloseHistory} />}
        />
      )}
    </div>
  );
};

export default Chat;
