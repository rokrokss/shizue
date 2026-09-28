import { Language, useLanguage, useTranslateTargetLanguage } from '@/hooks/language';
import {
  Theme,
  toggleYPositionAtom,
  useShowToggle,
  useShowYoutubeCaptionToggle,
  useTheme,
  useToggleHiddenSiteList,
} from '@/hooks/layout';
import {
  useAnthropicValidated,
  useChatModel,
  useConnectionMode,
  useGeminiValidated,
  useModelAvailability,
  useOpenAIValidated,
  useOpenRouterValidated,
  useTranslateModel,
} from '@/hooks/models';
import {
  useSetAnthropicKey,
  useSetGeminiKey,
  useSetOpenAIKey,
  useSetOpenRouterKey,
} from '@/hooks/settings';
import { languageOptions } from '@/lib/language';
import {
  ApiKeyProvider,
  ChatModel,
  MODEL_OPTIONS,
  MODELS,
  TranslateModel,
} from '@/lib/modelRegistry';
import { getOS } from '@/lib/userOS';
import { validateApiKey } from '@/lib/validateApiKey';
import { debugLog } from '@/logs';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, List, Select, Tabs, Tag } from 'antd';
import { useSetAtom } from 'jotai';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const SettingsModalContent = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();
  const [targetLanguage, setTargetLanguage] = useTranslateTargetLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isInvalidApiKey, setIsInvalidApiKey] = useState(false);
  const [canProceed, setCanProceed] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [isValidateHovered, setIsValidateHovered] = useState(false);
  const setOpenAIKey = useSetOpenAIKey();
  const setGeminiKey = useSetGeminiKey();
  const setAnthropicKey = useSetAnthropicKey();
  const setOpenRouterKey = useSetOpenRouterKey();
  const [openAIValidated, setOpenAIValidated] = useOpenAIValidated();
  const [geminiValidated, setGeminiValidated] = useGeminiValidated();
  const [anthropicValidated, setAnthropicValidated] = useAnthropicValidated();
  const [openRouterValidated, setOpenRouterValidated] = useOpenRouterValidated();
  const [connectionMode, setConnectionMode] = useConnectionMode();
  const modelAvailability = useModelAvailability();
  const [chatModel, setChatModel] = useChatModel();
  const [translateModel, setTranslateModel] = useTranslateModel();
  const [theme, setTheme] = useTheme();
  const [showToggle, setShowToggle] = useShowToggle();
  const setToggleYPosition = useSetAtom(toggleYPositionAtom);
  const [showYoutubeCaptionToggle, setShowYoutubeCaptionToggle] = useShowYoutubeCaptionToggle();
  const [selectedProvider, setSelectedProvider] = useState<ApiKeyProvider>('openrouter-api-key');
  const [toggleHiddenSiteList, setToggleHiddenSiteList] = useToggleHiddenSiteList();

  const modelOptions = MODEL_OPTIONS.map((value) => ({
    value,
    label: MODELS[value].label,
    className: 'sz:font-ycom',
    disabled: !modelAvailability[value],
  }));

  const handleSelectLanguage = (value: string) => {
    setLang(value as Language);
  };

  const handleSelectTargetLanguage = (value: string) => {
    setTargetLanguage(value as Language);
  };

  const handleSelectProvider = (value: string) => {
    setSelectedProvider(value as ApiKeyProvider);
    setApiKey('');
  };

  const handleTogglePreferOpenRouter = () => {
    setConnectionMode(connectionMode === 'openrouter' ? 'direct' : 'openrouter');
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
    const trimmedKey = apiKey.trim();
    const isValid = await validateApiKey(trimmedKey, selectedProvider);
    if (isValid) {
      if (selectedProvider === 'openrouter-api-key') {
        setOpenRouterKey(trimmedKey);
        setOpenRouterValidated(true);
      } else if (selectedProvider === 'openai-api-key') {
        setOpenAIKey(trimmedKey);
        setOpenAIValidated(true);
      } else if (selectedProvider === 'gemini-api-key') {
        setGeminiKey(trimmedKey);
        setGeminiValidated(true);
      } else if (selectedProvider === 'anthropic-api-key') {
        setAnthropicKey(trimmedKey);
        setAnthropicValidated(true);
      }
      setIsInvalidApiKey(false);
      setCanProceed(true);
    } else {
      setIsInvalidApiKey(true);
      setCanProceed(false);
    }
    setIsLoading(false);
  };

  const handleRemoveHiddenSite = (item: string) => {
    setToggleHiddenSiteList(toggleHiddenSiteList.filter((site) => site !== item));
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
                    {t('settings.translateTargetLanguage')}
                  </div>
                  <Select
                    value={targetLanguage}
                    onChange={handleSelectTargetLanguage}
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
                {toggleHiddenSiteList.length > 0 && (
                  <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:gap-2 sz:w-full">
                    <div
                      className={`sz:text-base sz:w-full sz:text-center ${
                        theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                      }`}
                    >
                      {t('layout.hiddenSites')}
                    </div>
                    <List
                      dataSource={toggleHiddenSiteList}
                      bordered
                      size="small"
                      className={`sz:w-68 sz:overflow-auto sz:scrollbar-hidden ${
                        toggleHiddenSiteList.length > 0 ? 'sz:max-h-[125px]' : ''
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: `${theme == 'dark' ? '#111' : '#ddd'} transparent`,
                      }}
                      renderItem={(item) => (
                        <List.Item
                          className={`sz:font-ycom sz:text-small ${
                            theme == 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                          }`}
                        >
                          <div className="sz:w-68 sz:text-small sz:font-ycom sz:flex sz:flex-row sz:items-center sz:justify-between">
                            <div className="sz:text-small sz:font-ycom">
                              {item.length > 24 ? `${item.slice(0, 23)}...` : item}
                            </div>
                            <div className="sz:text-small sz:font-ycom">
                              <Button
                                type="dashed"
                                size="small"
                                className="sz:text-[12px] sz:font-ycom"
                                onClick={() => handleRemoveHiddenSite(item)}
                              >
                                {t('layout.restore')}
                              </Button>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                )}
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
                        value: 'openrouter-api-key',
                        label: t('onboarding.selectProvider.openRouterApiKey.title'),
                        className: 'sz:font-ycom',
                      },
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
                        value: 'anthropic-api-key',
                        label: t('onboarding.selectProvider.anthropicApiKey'),
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
                        selectedProvider === 'openrouter-api-key'
                          ? 'sk-or-v1-XXX......'
                          : selectedProvider === 'openai-api-key'
                          ? 'sk-proj-XXX......'
                          : selectedProvider === 'gemini-api-key'
                          ? 'AQ.XXX......'
                          : 'sk-ant-api03-XXX......'
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
                  <div className="sz:flex sz:flex-row sz:items-center sz:w-50 sz:mb-1 sz:wrap-normal sz:flex-wrap sz:gap-[1px]">
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={openAIValidated ? 'success' : 'default'}
                    >
                      OpenAI
                    </Tag>
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={geminiValidated ? 'success' : 'default'}
                    >
                      Gemini
                    </Tag>
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={anthropicValidated ? 'success' : 'default'}
                    >
                      Anthropic
                    </Tag>
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={openRouterValidated ? 'success' : 'default'}
                    >
                      OpenRouter
                    </Tag>
                  </div>
                  {openRouterValidated &&
                    (openAIValidated || geminiValidated || anthropicValidated) && (
                      <Checkbox
                        checked={connectionMode === 'openrouter'}
                        onChange={handleTogglePreferOpenRouter}
                        className="sz:font-ycom sz:w-50 sz:flex sz:flex-row sz:items-center sz:justify-center"
                      >
                        {t('settings.preferOpenRouter')}
                      </Checkbox>
                    )}
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
                    options={modelOptions}
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
                    options={modelOptions}
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
