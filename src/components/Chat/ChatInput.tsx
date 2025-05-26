import { Input } from 'antd';
import { useTranslation } from 'react-i18next';

const ChatInput = ({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) => {
  const { t } = useTranslation();
  const [chatInput, setChatInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey || isComposing) {
        return;
      }

      e.preventDefault();
      const currentValue = e.currentTarget.value;
      if (currentValue.trim() !== '') {
        onSubmit(currentValue.trim());
        setChatInput('');
      }
    }
  };

  return (
    <div className="sz-chat-input sz:w-full sz:h-41 sz:px-2">
      <Input.TextArea
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={handleKeyDown}
        placeholder={t('chat.askAnything')}
        autoSize={{ minRows: 1, maxRows: 6 }}
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
  );
};

export default ChatInput;
