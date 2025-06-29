import Footer from '@/components/Footer';
import { ChatStatus, isChatWaiting } from '@/hooks/chat';
import { useThemeValue } from '@/hooks/layout';
import { FolderOutlined, LineChartOutlined, PauseOutlined, SmileOutlined } from '@ant-design/icons';
import { Button, Input, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const ChatInput = ({
  chatStatus,
  onSubmit,
  onCancel,
  onOpenHistory,
  onNewChat,
  onOpenUsage,
}: {
  chatStatus: ChatStatus;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onOpenHistory: () => void;
  onNewChat: () => Promise<void>;
  onOpenUsage: () => void;
}) => {
  const { t } = useTranslation();
  const [chatInput, setChatInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const theme = useThemeValue();

  const handleSubmit = async (text: string) => {
    if (text !== '') {
      onSubmit(text);
      setChatInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey || isComposing) {
        return;
      }

      e.preventDefault();
      if (isChatWaiting(chatStatus)) return;
      const currentValue = e.currentTarget.value.trim();
      handleSubmit(currentValue);
    }
  };

  return (
    <div className="sz-chat-input sz:w-full sz:px-2 sz:flex sz:flex-col sz:items-center sz:justify-center">
      <div className="sz:flex sz:flex-col sz:w-full sz:h-45 sz:px-2">
        <div className="sz:flex sz:items-center sz:justify-center">
          <div className="sz:flex sz:w-full sz:items-center sz:justify-start">
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:text-black sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('chat.history')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onOpenHistory()}
                type="text"
                icon={
                  <FolderOutlined
                    style={{
                      fontSize: '20px',
                      color: 'rgba(0,0,0,0.88)',
                      filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:text-black sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('chat.newChat')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onNewChat()}
                type="text"
                icon={
                  <SmileOutlined
                    style={{
                      fontSize: '20px',
                      color: 'rgba(0,0,0,0.88)',
                      filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
            <Tooltip
              placement="top"
              title={
                <div
                  className={`sz:text-black sz:font-ycom sz:z-2147483647 ${
                    theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
                  }`}
                >
                  {t('usage.title')}
                </div>
              }
              color={theme == 'dark' ? '#505362' : 'white'}
              className="sz:font-ycom"
            >
              <Button
                onClick={() => onOpenUsage()}
                type="text"
                icon={
                  <LineChartOutlined
                    style={{
                      fontSize: '20px',
                      color: 'rgba(0,0,0,0.88)',
                      filter: theme == 'dark' ? 'invert(1) hue-rotate(180deg)' : 'none',
                    }}
                  />
                }
                size="middle"
              ></Button>
            </Tooltip>
          </div>
        </div>
        <Input.TextArea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.askAnything')}
          autoSize
          className="
            sz:w-full
            sz:h-full
            sz:font-ycom
            sz:flex
            sz:flex-col
            sz:items-start
            sz:justify-start
            sz:pt-2
            sz:placeholder:text-base
            sz:placeholder:text-gray-400
          "
        />
      </div>
      {isChatWaiting(chatStatus) && (
        <div
          onMouseEnter={() => setIsCancelHovered(true)}
          onMouseLeave={() => setIsCancelHovered(false)}
          className="sz:absolute sz:bottom-8 sz:right-6 sz:flex sz:items-center sz:justify-center sz:text-gray-400 sz:hover:text-sz-cyan"
        >
          <Button
            shape="circle"
            onClick={() => onCancel()}
            icon={
              <PauseOutlined
                className={`sz:text-gray-400 ${isCancelHovered ? 'sz:text-sz-cyan' : ''}`}
              />
            }
            size="large"
          ></Button>
        </div>
      )}
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default ChatInput;
