import ChatGreeting from '@/components/Chat/ChatGreeting';
import ChatInput from '@/components/Chat/ChatInput';
import SettingsModal from '@/components/Chat/SettingsModal';
import TopMenu from '@/components/Chat/TopRightMenu';
import { debugLog } from '@/logs';

const Chat = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSubmit = (text: string) => {
    debugLog(text);
  };

  const handleTopMenuSettingsClick = () => {
    debugLog('settings clicked');
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  return (
    <div className="sz-chat sz:w-full sz:h-full sz:flex sz:flex-col sz:items-center">
      <TopMenu onSettingsClick={handleTopMenuSettingsClick} />
      <div className="sz-chat-main sz:flex sz:flex-col sz:items-center sz:justify-center sz:h-full sz:w-full">
        <ChatGreeting />
      </div>
      <ChatInput onSubmit={handleSubmit} />
      {isSettingsOpen && <SettingsModal onClose={closeSettings} />}
    </div>
  );
};

export default Chat;
