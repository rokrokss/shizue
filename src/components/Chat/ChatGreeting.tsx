import PhotoIcon from '@/assets/icons/photo.svg?react';
import CharacterStanding from '@/components/Character/CharacterStanding';
import { useThemeValue } from '@/hooks/layout';
import { Button } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const ChatGreeting = () => {
  const { t } = useTranslation();
  const theme = useThemeValue();
  const [isHoveringPdf, setIsHoveringPdf] = useState(false);
  const navigate = useNavigate();

  const handlePdfClick = () => {
    navigate('/shizue-pdf');
  };

  return (
    <div className="sz-chat-greeting-container sz:flex sz:flex-col sz:items-center sz:justify-center sz:h-full sz:w-full sz:pb-35">
      <div className="sz-chat-greeting sz:flex sz:flex-row sz:items-center sz:justify-center">
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
      <div className="sz:w-[294px] sz:mt-3 sz:font-ycom sz:flex sz:flex-row sz:items-start sz:justify-start">
        <Button
          size="middle"
          onMouseEnter={() => setIsHoveringPdf(true)}
          onMouseLeave={() => setIsHoveringPdf(false)}
          onClick={handlePdfClick}
          icon={
            <PhotoIcon
              className="sz:w-[20px] sz:h-full sz:flex sz:items-center sz:justify-center"
              style={{
                color: isHoveringPdf
                  ? '#32CCBC'
                  : theme == 'dark'
                  ? 'rgba(255,255,255,0.88)'
                  : 'rgba(0,0,0,0.75)',
                transition: 'color 0.3s ease',
              }}
            />
          }
          className="sz:font-ycom sz:text-[14px]"
          style={{
            color: isHoveringPdf
              ? '#32CCBC'
              : theme == 'dark'
              ? 'rgba(255,255,255,0.88)'
              : 'rgba(0,0,0,0.75)',
            transition: 'color 0.3s ease',
          }}
        >
          {t('pdf.translatePdf')}
        </Button>
      </div>
    </div>
  );
};

export default ChatGreeting;
