import { Language, useLanguage } from '@/hooks/language';
import { languageOptions } from '@/lib/language';
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
    setLang(value as Language);
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
        options={languageOptions(t)}
        optionRender={(option) => {
          return (
            <div className="sz:font-ycom">
              {option.label}
              {option.label != option.data.desc ? (
                <span className="sz:text-gray-500 sz:ml-[5px] sz:text-[12px]">
                  {option.data.desc}
                </span>
              ) : null}
            </div>
          );
        }}
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
