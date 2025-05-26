import { debugLog } from '@/logs';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function StepProvider({ onBack }: { onBack: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isInvalidApiKey, setIsInvalidApiKey] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [apiKey, setApiKey] = useState(
    process.env.NODE_ENV === 'development' ? import.meta.env.WXT_OPENAI_API_KEY : ''
  );
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [_, setSettings] = useSettings();

  const lines = [
    t('onboarding.selectProvider.title'),
    t('onboarding.selectProvider.openaiApiKey.description_0'),
    t('onboarding.selectProvider.openaiApiKey.description_1'),
    t('onboarding.selectProvider.chatGPTWebApp.description'),
  ];

  const handleSelect = (value: string) => {};

  const onClickValidate = async () => {
    setIsLoading(true);
    if (!apiKey || !apiKey.startsWith('sk-')) {
      debugLog('Invalid API key');
      setIsLoading(false);
      setIsInvalidApiKey(true);
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        setIsInvalidApiKey(false);
        setSettings((prev) => ({
          ...prev,
          openAIKey: apiKey,
        }));
        setCanProceed(true);
      } else {
        const errorJson = await response.json();
        debugLog('OpenAI error', errorJson);
        setIsInvalidApiKey(true);
      }
    } catch (e) {
      debugLog('API validation error', e);
      setIsInvalidApiKey(true);
    } finally {
      setIsLoading(false);
    }
  };

  const onClickNext = () => {
    navigate('/default');
  };

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
          sz:w-80
          sz:text-sm
          sz:text-gray-500
          sz:pl-1
          sz:pt-[3px]
          sz:mb-3
        `}
      >
        <div>{lines[1]}</div>
        <div>{lines[2]}</div>
      </div>
      <div className="sz:flex sz:flex-row sz:items-center sz:w-80">
        <Input
          placeholder="sk-XXX......"
          className="sz:font-ycom sz:mr-[5px]"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          status={isInvalidApiKey ? 'error' : undefined}
        />
        <Button
          className="sz:font-semibold sz:text-base sz:font-ycom"
          type="primary"
          onClick={onClickValidate}
          loading={isLoading}
        >
          {isLoading ? null : canProceed ? (
            <SmileOutlined style={{ fontSize: '20px' }} />
          ) : (
            t('onboarding.selectProvider.openaiApiKey.validate')
          )}
        </Button>
      </div>
      <Button
        className="sz:mt-2 sz:font-semibold sz:text-base sz:font-ycom"
        type="primary"
        disabled={!canProceed || isLoading}
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
