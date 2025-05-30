import { useLanguage } from '@/hooks/language';
import { Button, Select } from 'antd';
import { useTranslation } from 'react-i18next';

export default function StepLanguage({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();

  const lines = [t('onboarding.selectLanguage.title')];

  const onClickNext = () => {
    onNext();
  };

  const handleSelect = (value: string) => {
    setLang(value as 'English' | 'Korean');
  };

  return (
    <div className="sz:flex sz:flex-col sz:pt-30">
      <div className="sz:text-lg whitespace-pre-wrap sz:min-h-13 sz:w-60 sz:flex sz:items-center sz:justify-center">
        {lines[0]}
      </div>
      <Select
        defaultValue={lang}
        onChange={handleSelect}
        className="sz:font-ycom"
        options={[
          { value: 'English', label: t('onboarding.selectLanguage.en'), className: 'sz:font-ycom' },
          { value: 'Korean', label: t('onboarding.selectLanguage.ko'), className: 'sz:font-ycom' },
        ]}
      />
      <Button
        className="sz:mt-2 sz:font-semibold sz:text-base sz:font-ycom"
        type="primary"
        onClick={onClickNext}
      >
        {t('onboarding.next')}
      </Button>
      <Button
        className="sz:mt-1 sz:font-semibold sz:text-base sz:font-ycom"
        type="dashed"
        onClick={onBack}
      >
        {t('onboarding.back')}
      </Button>
    </div>
  );
}
