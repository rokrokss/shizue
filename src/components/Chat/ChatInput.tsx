import Footer from '@/components/Footer';
import { Button, Input } from 'antd';
import { useTranslation } from 'react-i18next';

const ChatInput = ({
  onSubmit,
  onCancel,
}: {
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
      <div className="sz:absolute sz:bottom-2 sz:right-2 sz:flex sz:gap-2">
        <Button size="small" onClick={() => onCancel()}>
          취소
        </Button>
        <Button
          type="primary"
          size="small"
          onClick={() => handleSubmit(chatInput)}
          disabled={!chatInput.trim()}
        >
          보내기
        </Button>
      </div>
      <div className="sz-sidepanel-footer sz:h-6 sz:w-full sz:flex sz:items-center sz:justify-center">
        <Footer />
      </div>
    </div>
  );
};

export default ChatInput;
