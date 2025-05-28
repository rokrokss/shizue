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
import { debugLog, errorLog } from '@/logs';
import { addMessage, createThread, touchThread } from '@/utils/indexDB';
import { throttleTrailing } from '@/utils/throttleTrailing';
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

  const scrollToBottom = useMemo(
    () =>
      throttleTrailing(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    chrome.runtime.sendMessage({ type: MESSAGE_LOAD_THREAD, threadId }).then((res: Message[]) => {
      debugLog(res);
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
      type: MESSAGE_CANCEL_NOT_STARTED_MESSAGE,
      threadId,
    });
    setIsWaitingForResponse(false);
    scrollToBottom();
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
    scrollToBottom();

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
            scrollToBottom();
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
          scrollToBottom();
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
          scrollToBottom();
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
          <ChatContainer messages={messages} scrollToBottom={scrollToBottom} />
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
