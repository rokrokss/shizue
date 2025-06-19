import { Language, useLanguage } from '@/hooks/language';
import { toggleYPositionAtom, useShowToggle, useShowYoutubeCaptionToggle } from '@/hooks/layout';
import {
  useChatModel,
  useGeminiValidated,
  useOpenAIValidated,
  useTranslateModel,
} from '@/hooks/models';
import { useSetGeminiKey, useSetOpenAIKey } from '@/hooks/settings';
import { languageOptions } from '@/lib/language';
import { ChatModel, ModelProvider, TranslateModel } from '@/lib/models';
import { getOS } from '@/lib/userOS';
import { validateApiKey } from '@/lib/validateApiKey';
import { debugLog } from '@/logs';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Select, Tabs, Tag } from 'antd';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';

const SettingsModalContent = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isInvalidApiKey, setIsInvalidApiKey] = useState(false);
  const [canProceed, setCanProceed] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [isValidateHovered, setIsValidateHovered] = useState(false);
  const setOpenAIKey = useSetOpenAIKey();
  const setGeminiKey = useSetGeminiKey();
  const [openAIValidated, setOpenAIValidated] = useOpenAIValidated();
  const [geminiValidated, setGeminiValidated] = useGeminiValidated();
  const [chatModel, setChatModel] = useChatModel();
  const [translateModel, setTranslateModel] = useTranslateModel();
  const [theme, setTheme] = useTheme();
  const [showToggle, setShowToggle] = useShowToggle();
  const setToggleYPosition = useSetAtom(toggleYPositionAtom);
  const [showYoutubeCaptionToggle, setShowYoutubeCaptionToggle] = useShowYoutubeCaptionToggle();
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('openai-api-key');

  const handleSelectLanguage = (value: string) => {
    setLang(value as Language);
  };

  const handleSelectProvider = (value: string) => {
    setSelectedProvider(value as ModelProvider);
    setApiKey('');
  };

  const handleSelectChatModel = (value: string) => {
    debugLog('handleSelectChatModel', value);
    setChatModel(value as ChatModel);
  };

  const handleSelectTranslateModel = (value: string) => {
    debugLog('handleSelectTranslateModel', value);
    setTranslateModel(value as TranslateModel);
  };

  const handleToggleShowToggle = () => {
    setShowToggle(!showToggle);
  };

  const handleToggleYoutubeCaptionToggle = () => {
    setShowYoutubeCaptionToggle(!showYoutubeCaptionToggle);
  };

  const handleSelectTheme = (value: string) => {
    setTheme(value as Theme);
  };

  const userOS = getOS();

  const onClickValidate = async () => {
    setIsLoading(true);
    const isValid = await validateApiKey(apiKey, selectedProvider);
    if (isValid) {
      if (selectedProvider === 'openai-api-key') {
        setOpenAIKey(apiKey);
        setOpenAIValidated(true);
      } else if (selectedProvider === 'gemini-api-key') {
        setGeminiKey(apiKey);
        setGeminiValidated(true);
      }
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
      <div
        className="sz:text-lg sz:font-semibold sz:text-center"
        style={{
          color: theme == 'dark' ? 'white' : 'black',
        }}
      >
        {t('settings.title')}
      </div>
      <Tabs
        defaultActiveKey="일반"
        centered
        className="sz:font-ycom"
        items={[
          {
            key: 'general',
            label: t('settings.general'),
            children: (
              <div className="sz:flex sz:flex-col sz:gap-4">
                <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.language')}
                  </div>
                  <Select
                    value={lang}
                    onChange={handleSelectLanguage}
                    className="sz:font-ycom sz:w-60"
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
                </div>
                <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.shortcut')}
                  </div>
                  <Input
                    className="sz:w-60"
                    style={{ caretColor: 'transparent' }}
                    value={userOS === 'mac' ? '⌘ + Shift + E' : 'Ctrl + Shift + E'}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'models',
            label: t('settings.models'),
            children: (
              <div className="sz:flex sz:flex-col sz:gap-4">
                <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.aiProvider')}
                  </div>
                  <Select
                    value={selectedProvider}
                    onChange={handleSelectProvider}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'openai-api-key',
                        label: t('onboarding.selectProvider.openaiApiKey.title'),
                        className: 'sz:font-ycom',
                      },
                      {
                        value: 'gemini-api-key',
                        label: t('onboarding.selectProvider.geminiApiKey'),
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
                      placeholder={
                        selectedProvider === 'openai-api-key' ? 'sk-XXX......' : 'AIza......'
                      }
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
                      style={{
                        color: theme == 'dark' ? '#000' : 'white',
                      }}
                    >
                      {!isLoading &&
                        (isValidateHovered || !canProceed ? (
                          t('onboarding.selectProvider.openaiApiKey.validate')
                        ) : (
                          <SmileOutlined style={{ fontSize: '20px' }} />
                        ))}
                    </Button>
                  </div>
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.registered')}
                  </div>
                  <div className="sz:flex sz:flex-row sz:items-center sz:w-50 sz:mb-1 sz:wrap-normal sz:flex-wrap sz:gap-1">
                    <Tag color={openAIValidated ? 'success' : 'default'}>OpenAI</Tag>
                    <Tag color={geminiValidated ? 'success' : 'default'}>Gemini</Tag>
                  </div>
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.chatModel')}
                  </div>
                  <Select
                    value={chatModel}
                    onChange={handleSelectChatModel}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'gpt-4.1',
                        label: 'GPT 4.1',
                        className: 'sz:font-ycom',
                        disabled: openAIValidated ? false : true,
                      },
                      {
                        value: 'gpt-4.1-mini',
                        label: 'GPT 4.1 Mini',
                        className: 'sz:font-ycom',
                        disabled: openAIValidated ? false : true,
                      },
                      {
                        value: 'gemini-2.5-flash',
                        label: 'Gemini 2.5 Flash',
                        className: 'sz:font-ycom',
                        disabled: geminiValidated ? false : true,
                      },
                      {
                        value: 'gemini-2.5-flash-lite-preview-06-17',
                        label: 'Gemini 2.5 Flash Lite',
                        className: 'sz:font-ycom',
                        disabled: geminiValidated ? false : true,
                      },
                      {
                        value: 'wip',
                        label: t('onboarding.selectProvider.chatGPTWebApp.title'),
                        className: 'sz:font-ycom',
                        disabled: true,
                      },
                    ]}
                  />
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.translateModel')}
                  </div>
                  <Select
                    value={translateModel}
                    onChange={handleSelectTranslateModel}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'gpt-4.1',
                        label: 'GPT 4.1',
                        className: 'sz:font-ycom',
                        disabled: openAIValidated ? false : true,
                      },
                      {
                        value: 'gpt-4.1-mini',
                        label: 'GPT 4.1 Mini',
                        className: 'sz:font-ycom',
                        disabled: openAIValidated ? false : true,
                      },
                      {
                        value: 'gemini-2.5-flash',
                        label: 'Gemini 2.5 Flash',
                        className: 'sz:font-ycom',
                        disabled: geminiValidated ? false : true,
                      },
                      {
                        value: 'gemini-2.5-flash-lite-preview-06-17',
                        label: 'Gemini 2.5 Flash Lite',
                        className: 'sz:font-ycom',
                        disabled: geminiValidated ? false : true,
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
            ),
          },
          {
            key: 'layout',
            label: t('settings.layout'),
            children: (
              <div className="sz:flex sz:flex-col sz:gap-4">
                <div className="sz:flex sz:flex-col sz:items-center sz:gap-2">
                  <div
                    className={`sz:text-base ${
                      theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('layout.theme')}
                  </div>
                  <Select
                    value={theme}
                    onChange={handleSelectTheme}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'light',
                        label: t('layout.lightMode'),
                        className: 'sz:font-ycom',
                      },
                      {
                        value: 'dark',
                        label: t('layout.darkMode'),
                        className: 'sz:font-ycom',
                      },
                    ]}
                  />
                  <div className="sz:flex sz:flex-col sz:items-center sz:w-50 sz:mt-1">
                    <div
                      className={`sz:text-base ${
                        theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                      }`}
                    >
                      {t('layout.menuButton')}
                    </div>
                    <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:w-50 sz:mt-2">
                      <Checkbox
                        checked={!showToggle}
                        onChange={handleToggleShowToggle}
                        className="sz:font-ycom sz:w-50 sz:flex sz:flex-row sz:items-center sz:justify-center"
                      >
                        {t('layout.hideToggle')}
                      </Checkbox>
                      <Button
                        className="sz:font-semibold sz:text-small sz:font-ycom sz:mt-2 sz:min-w-27"
                        type="primary"
                        onClick={() => setToggleYPosition(defaultToggleYPosition)}
                        style={{
                          color: theme == 'dark' ? '#000' : 'white',
                        }}
                        size="small"
                      >
                        {t('layout.resetPosition')}
                      </Button>
                    </div>
                  </div>
                  <div className="sz:flex sz:flex-col sz:items-center sz:w-50 sz:mt-1">
                    <div
                      className={`sz:text-base ${
                        theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                      }`}
                    >
                      {t('youtube.youtubeCaptionButton')}
                    </div>
                    <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:w-50 sz:mt-2">
                      <Checkbox
                        checked={!showYoutubeCaptionToggle}
                        onChange={handleToggleYoutubeCaptionToggle}
                        className="sz:font-ycom sz:w-50 sz:flex sz:flex-row sz:items-center sz:justify-center"
                      >
                        {t('layout.hideToggle')}
                      </Checkbox>
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </>
  );
};

export default SettingsModalContent;
