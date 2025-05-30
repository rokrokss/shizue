import { useSettings } from '@/hooks/settings';
import { ChatModel, TranslateModel } from '@/lib/models';
import { getOS } from '@/lib/userOS';
import { validateApiKey } from '@/lib/validateApiKey';
import { debugLog } from '@/logs';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Input, Select } from 'antd';
import { useTranslation } from 'react-i18next';

const SettingsModalContent = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isInvalidApiKey, setIsInvalidApiKey] = useState(false);
  const [canProceed, setCanProceed] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [isValidateHovered, setIsValidateHovered] = useState(false);
  const [_, setSettings] = useSettings();
  const [models, setModels] = useModels();

  const handleSelectLanguage = (value: string) => {
    setLang(value as 'English' | 'Korean');
  };

  const handleSelectApiKey = (value: string) => {
    setApiKey(value);
  };

  const handleSelectChatModel = (value: string) => {
    debugLog('handleSelectChatModel', value);
    setModels((prev) => ({
      ...prev,
      chatModel: value as ChatModel,
      translateModel: models.translateModel,
    }));
  };

  const handleSelectTranslateModel = (value: string) => {
    debugLog('handleSelectTranslateModel', value);
    setModels((prev) => ({
      ...prev,
      chatModel: models.chatModel,
      translateModel: value as TranslateModel,
    }));
  };

  const userOS = getOS();

  const onClickValidate = async () => {
    setIsLoading(true);
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      setSettings((prev) => ({
        ...prev,
        openAIKey: apiKey,
      }));
      setIsInvalidApiKey(false);
      setCanProceed(true);
    } else {
      setIsInvalidApiKey(true);
      setCanProceed(false);
    }
    setIsLoading(false);
  };

  return (
    <>
      <div className="sz:text-lg sz:font-semibold sz:mb-4 sz:text-center">
        {t('settings.title')}
      </div>
      <div className="sz:flex sz:flex-col sz:gap-4">
        <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
          <div className="sz:text-base sz:text-gray-800">{t('settings.language')}</div>
          <Select
            value={lang}
            onChange={handleSelectLanguage}
            className="sz:font-ycom sz:w-30"
            options={[
              {
                value: 'English',
                label: t('onboarding.selectLanguage.en'),
                className: 'sz:font-ycom',
              },
              {
                value: 'Korean',
                label: t('onboarding.selectLanguage.ko'),
                className: 'sz:font-ycom',
              },
            ]}
          />
        </div>
        <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
          <div className="sz:text-base sz:text-gray-800">{t('settings.shortcut')}</div>
          <Input
            className="sz:w-35"
            disabled={true}
            value={userOS === 'mac' ? '⌘ + Shift + E' : 'Ctrl + Shift + E'}
          />
        </div>
        <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
          <div className="sz:text-base sz:text-gray-800">{t('settings.aiProvider')}</div>
          <Select
            defaultValue="openai-api-key"
            onChange={handleSelectApiKey}
            className="sz:font-ycom sz:w-50"
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
          <div className="sz:flex sz:flex-row sz:items-center sz:w-50 sz:mb-1">
            <Input
              className="sz:font-ycom sz:text-sm sz:mr-[5px] sz:h-8"
              placeholder="sk-XXX......"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              status={isInvalidApiKey ? 'error' : undefined}
            />
            <Button
              className="sz:font-semibold sz:text-base sz:font-ycom sz:h-8"
              type="primary"
              onClick={onClickValidate}
              loading={isLoading}
              onMouseEnter={() => setIsValidateHovered(true)}
              onMouseLeave={() => setIsValidateHovered(false)}
            >
              {!isLoading &&
                (isValidateHovered || !canProceed ? (
                  t('onboarding.selectProvider.openaiApiKey.validate')
                ) : (
                  <SmileOutlined style={{ fontSize: '20px' }} />
                ))}
            </Button>
          </div>
          <div className="sz:text-base sz:text-gray-800">대화 모델</div>
          <Select
            value={models.chatModel}
            onChange={handleSelectChatModel}
            className="sz:font-ycom sz:w-50"
            options={[
              {
                value: 'gpt-4.1',
                label: 'GPT 4.1',
                className: 'sz:font-ycom',
              },
              {
                value: 'gpt-4.1-mini',
                label: 'GPT 4.1 Mini',
                className: 'sz:font-ycom',
              },
              {
                value: 'wip',
                label: t('onboarding.selectProvider.chatGPTWebApp.title'),
                className: 'sz:font-ycom',
                disabled: true,
              },
            ]}
          />
          <div className="sz:text-base sz:text-gray-800">번역 모델</div>
          <Select
            value={models.translateModel}
            onChange={handleSelectTranslateModel}
            className="sz:font-ycom sz:w-50"
            options={[
              {
                value: 'gpt-4.1',
                label: 'GPT 4.1',
                className: 'sz:font-ycom',
              },
              {
                value: 'gpt-4.1-mini',
                label: 'GPT 4.1 Mini',
                className: 'sz:font-ycom',
              },
              {
                value: 'wip',
                label: t('onboarding.selectProvider.chatGPTWebApp.title'),
                className: 'sz:font-ycom',
                disabled: true,
              },
            ]}
          />
        </div>
      </div>
    </>
  );
};

export default SettingsModalContent;
