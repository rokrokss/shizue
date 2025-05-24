import { useLanguage } from '@/hooks/useLanguage';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

const Onboarding = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();

  return (
    <div>
      {t('onboarding.title')}
      <Button onClick={() => setLang('en')}>en</Button>
      <Button onClick={() => setLang('ko')}>ko</Button>
    </div>
  );
};

export default Onboarding;
