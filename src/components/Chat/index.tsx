import ChatContainer from '@/components/Chat/ChatContainer';
import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import SettingsModal from '@/components/Chat/SettingsModal';
import TopMenu from '@/components/Chat/TopRightMenu';
import { MESSAGE_LOAD_THREAD } from '@/config/constants';
import { currentThreadIdAtom } from '@/hooks/chat';
import { useChromePortStream } from '@/hooks/portStream';
import { debugLog } from '@/logs';
import { addMessage, createThread, touchThread } from '@/utils/indexDB';
import { throttleTrailing } from '@/utils/throttleTrailing';
import { useAtom } from 'jotai';
import { useRef, useState } from 'react';

export interface Message {
  role: 'human' | 'system' | 'ai';
  content: string;
}

const Chat = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [threadId, setThreadId] = useAtom(currentThreadIdAtom);
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const aiIndexRef = useRef<number>(-1);
  const { startStream, cancelStream } = useChromePortStream();

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
    chrome.runtime
      .sendMessage({ type: MESSAGE_LOAD_THREAD, threadId })
      .then((res: Message[]) => setMessages(res));
  }, []);

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
      return [...prev, { role: 'human', content: text }, { role: 'ai', content: '' }];
    });

    await addMessage({
      id: crypto.randomUUID(),
      threadId: threadId,
      role: 'human',
      content: text,
      createdAt: Date.now(),
    });
    await touchThread(threadId);
  };

  useEffect(() => {
    if (threadId) loadThreadBackground(threadId);
  }, []);

  useEffect(() => {
    debugLog('messages', messages);
  }, [messages]);

  const handleSubmit = async (text: string) => {
    const id = await checkIfThreadExists(text);

    await addHumanMessage(id, text);

    startStream(
      { threadId: id },
      {
        onDelta: (delta) =>
          setMessages((cur) => {
            const idx = aiIndexRef.current;
            const copy = [...cur];
            copy[idx] = { role: 'ai', content: copy[idx].content + delta };
            scrollToBottom();
            return copy;
          }),
        onDone: () => touchThread(id),
      }
    );
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
        {threadId ? <ChatContainer messages={messages} /> : <ChatGreeting />}
        <div ref={bottomRef} />
      </div>
      <div className="sz:w-full">
        <ChatInput onSubmit={handleSubmit} />
      </div>
      {isSettingsOpen && <SettingsModal onClose={closeSettings} />}
    </div>
  );
};

export default Chat;
