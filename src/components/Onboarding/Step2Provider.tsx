import { Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function StepProvider({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [canProceed, setCanProceed] = useState(false);
  const { t } = useTranslation();

  const lines = [
    t('onboarding.selectProvider.title'),
    t('onboarding.selectProvider.openaiApiKey.description'),
    t('onboarding.selectProvider.chatGPTWebApp.description'),
  ];

  const handleSelect = (value: string) => {};

  const onClickValidate = () => {};

  return (
    <div className="sz:flex sz:flex-col sz:pt-30">
      <div className="sz:text-lg whitespace-pre-wrap sz:min-h-13 sz:w-80 sz:flex sz:items-center sz:justify-center">
        {lines[0]}
      </div>
      <Select
        defaultValue="openai-api-key"
        onChange={handleSelect}
        className="sz:font-ycom"
        options={[
          {
            value: 'openai-api-key',
            label: t('onboarding.selectProvider.openaiApiKey.title'),
            className: 'sz:font-ycom',
          },
          {
            value: 'chatgpt-webapp',
            label: t('onboarding.selectProvider.chatGPTWebApp.title'),
            className: 'sz:font-ycom',
            disabled: true,
          },
        ]}
      />
      <div
        className={`
          sz:flex
          sz:flex-col
          sz:items-start
          sz:w-60
          sz:text-sm
          sz:text-gray-500
          sz:pl-1
          sz:pt-[3px]
          sz:mb-3
        `}
      >
        <div>{lines[1]}</div>
      </div>
      <div className="sz:flex sz:flex-row sz:items-center sz:w-80">
        <Input placeholder="sk-XXX......" className="sz:font-ycom sz:mr-[5px]" />
        <Button
          className="sz:font-semibold sz:text-base sz:font-ycom"
          type="primary"
          onClick={onClickValidate}
        >
          {t('onboarding.selectProvider.openaiApiKey.validate')}
        </Button>
      </div>
      <Button
        className="sz:mt-2 sz:font-semibold sz:text-base sz:font-ycom"
        type="primary"
        disabled={!canProceed}
        onClick={onNext}
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
