import CharacterStanding from '@/components/Character/CharacterStanding';
import { useThemeValue } from '@/hooks/layout';
import { useTranslation } from 'react-i18next';

const ChatGreeting = () => {
  const { t } = useTranslation();
  const theme = useThemeValue();

  return (
    <div className="sz-chat-greeting sz:flex sz:flex-row sz:items-center sz:justify-center sz:h-full sz:pb-35">
      <CharacterStanding scale={3} marginLeft="0" invert={theme == 'dark'} />
      <div
        className={`sz-chat-greeting-message sz:text-xl sz:ml-3 sz:pt-2 ${
          theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
        }`}
      >
        <div>{t('chat.greeting')}</div>
        <div>{t('chat.main_0')}</div>
      </div>
    </div>
  );
};

export default ChatGreeting;
