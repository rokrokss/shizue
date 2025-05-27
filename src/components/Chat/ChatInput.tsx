import StopIcon from '@/assets/icons/stop.svg?react';
import Footer from '@/components/Footer';
import { Button, Input } from 'antd';
import { useTranslation } from 'react-i18next';

const ChatInput = ({
  isWaitingForResponse,
  onSubmit,
  onCancel,
}: {
  isWaitingForResponse: boolean;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [chatInput, setChatInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);

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
      if (isWaitingForResponse) return;
      const currentValue = e.currentTarget.value.trim();
      handleSubmit(currentValue);
    }
  };

  return (
    <div className="sz-chat-input sz:w-full sz:px-2 sz:flex sz:flex-col sz:items-center sz:justify-center">
      <div className="sz:w-full sz:h-40 sz:px-2">
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
      {isWaitingForResponse && (
        <div className="sz:absolute sz:bottom-8 sz:right-6 sz:flex sz:items-center sz:justify-center">
          <Button
            shape="circle"
            onClick={() => onCancel()}
            icon={<StopIcon />}
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
