import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SmileOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, List, Select, Tabs, Tag, Spin, message } from 'antd';
import { useSettings } from '@/hooks/useSettings';
import { languageOptions } from '@/lib/language';
import { getOS } from '@/lib/userOS';
import { validateApiKey } from '@/lib/validateApiKey';
import { debugLog } from '@/logs';
import { ModelProvider, formatModelName } from '@/lib/models';

const defaultToggleYPosition = 50;

const SettingsModalContent = () => {
  const { t } = useTranslation();
  const {
    settings,
    loading,
    error,
    isAuthenticated,
    updateSettings,
    updateApiKey,
    migrateSettings,
  } = useSettings();

  const [isValidating, setIsValidating] = useState(false);
  const [isInvalidApiKey, setIsInvalidApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isValidateHovered, setIsValidateHovered] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('openai-api-key');

  const userOS = getOS();

  // Auto-migrate settings on first load if authenticated
  useEffect(() => {
    if (isAuthenticated && settings) {
      // Check if migration is needed (can be done once per user)
      const shouldMigrate =
        !settings.apiKeys?.openai && !settings.apiKeys?.gemini && !settings.apiKeys?.anthropic;
      if (shouldMigrate) {
        migrateSettings().catch(console.error);
      }
    }
  }, [isAuthenticated, settings]);

  // Show loading spinner while settings are being loaded
  if (loading) {
    return (
      <div className="sz:flex sz:items-center sz:justify-center sz:h-64">
        <Spin size="large" />
      </div>
    );
  }

  // Show error if settings failed to load
  if (error) {
    return (
      <div className="sz:text-center sz:text-red-500 sz:p-4">
        {t('settings.loadError')}: {error}
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  const handleSelectLanguage = async (value: string) => {
    await updateSettings({
      general: { language: value },
    });
  };

  const handleSelectTargetLanguage = async (value: string) => {
    await updateSettings({
      general: { translateTargetLanguage: value },
    });
  };

  const handleSelectProvider = (value: string) => {
    setSelectedProvider(value as ModelProvider);
    setApiKey('');
  };

  const handleSelectChatSize = async (value: 'large' | 'small') => {
    debugLog('handleSelectChatSize', value);
    await updateSettings({
      models: { chatSize: value },
    });
  };

  const handleSelectTranslateSize = async (value: 'large' | 'small') => {
    debugLog('handleSelectTranslateSize', value);
    await updateSettings({
      models: { translateSize: value },
    });
  };

  const handleSelectProviderPreference = async (
    value: 'openai' | 'gemini' | 'anthropic' | undefined
  ) => {
    debugLog('handleSelectProviderPreference', value);
    await updateSettings({
      models: { providerPreference: value },
    });
  };

  const handleToggleShowToggle = async () => {
    await updateSettings({
      layout: { showToggle: !settings.layout.showToggle },
    });
  };

  const handleToggleYoutubeCaptionToggle = async () => {
    await updateSettings({
      layout: { showYoutubeCaptionToggle: !settings.layout.showYoutubeCaptionToggle },
    });
  };

  const handleSelectTheme = async (value: string) => {
    await updateSettings({
      layout: { theme: value },
    });
  };

  const handleResetTogglePosition = async () => {
    await updateSettings({
      layout: { toggleYPosition: defaultToggleYPosition },
    });
  };

  const handleRemoveHiddenSite = async (item: string) => {
    const updatedList = settings.layout.toggleHiddenSiteList?.filter((site) => site !== item) || [];
    await updateSettings({
      layout: { toggleHiddenSiteList: updatedList },
    });
  };

  const onClickValidate = async () => {
    setIsValidating(true);
    setIsInvalidApiKey(false);

    try {
      // Validate API key
      const isValid = await validateApiKey(apiKey, selectedProvider);

      if (isValid) {
        // Save API key to server (or local storage if not authenticated)
        const provider = selectedProvider.replace('-api-key', '') as
          | 'openai'
          | 'gemini'
          | 'anthropic';
        await updateApiKey(provider, apiKey);

        // Update validation status
        const validationKey = `${provider}Validated` as
          | 'openaiValidated'
          | 'geminiValidated'
          | 'anthropicValidated';
        await updateSettings({
          apiKeys: { [validationKey]: true },
        });

        message.success(t('settings.apiKeyValidated'));
        setApiKey('');
      } else {
        setIsInvalidApiKey(true);
        message.error(t('settings.invalidApiKey'));
      }
    } catch (error) {
      console.error('Failed to validate API key:', error);
      message.error(t('settings.validationError'));
      setIsInvalidApiKey(true);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <>
      <div
        className="sz:text-lg sz:font-semibold sz:text-center"
        style={{
          color: settings.layout.theme === 'dark' ? 'white' : 'black',
        }}
      >
        {t('settings.title')}
        {!isAuthenticated && (
          <div className="sz:text-sm sz:text-gray-500 sz:mt-2">
            {t('settings.localStorageMode')}
          </div>
        )}
      </div>
      <Tabs
        defaultActiveKey="general"
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
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.language')}
                  </div>
                  <Select
                    value={settings.general.language}
                    onChange={handleSelectLanguage}
                    className="sz:font-ycom sz:w-60"
                    options={languageOptions(t)}
                    optionRender={(option) => {
                      return (
                        <div className="sz:font-ycom">
                          {option.label}
                          {option.label !== option.data.desc ? (
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
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.translateTargetLanguage')}
                  </div>
                  <Select
                    value={settings.general.translateTargetLanguage}
                    onChange={handleSelectTargetLanguage}
                    className="sz:font-ycom sz:w-60"
                    options={languageOptions(t)}
                    optionRender={(option) => {
                      return (
                        <div className="sz:font-ycom">
                          {option.label}
                          {option.label !== option.data.desc ? (
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
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
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
                {settings.layout.toggleHiddenSiteList &&
                  settings.layout.toggleHiddenSiteList.length > 0 && (
                    <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:gap-2 sz:w-full">
                      <div
                        className={`sz:text-base sz:w-full sz:text-center ${
                          settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                        }`}
                      >
                        {t('layout.hiddenSites')}
                      </div>
                      <List
                        dataSource={settings.layout.toggleHiddenSiteList}
                        bordered
                        size="small"
                        className={`sz:w-68 sz:overflow-auto sz:scrollbar-hidden ${
                          settings.layout.toggleHiddenSiteList.length > 0 ? 'sz:max-h-[125px]' : ''
                        }`}
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: `${settings.layout.theme === 'dark' ? '#111' : '#ddd'} transparent`,
                        }}
                        renderItem={(item) => (
                          <List.Item
                            className={`sz:font-ycom sz:text-small ${
                              settings.layout.theme === 'dark'
                                ? 'sz:text-gray-200'
                                : 'sz:text-gray-800'
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
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
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
                        selectedProvider === 'openai-api-key'
                          ? 'sk-XXX......'
                          : selectedProvider === 'gemini-api-key'
                            ? 'AIza......'
                            : 'sk-ant-XXX......'
                      }
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      status={isInvalidApiKey ? 'error' : undefined}
                    />
                    <Button
                      className="sz:font-semibold sz:text-base sz:font-ycom sz:h-8"
                      type="primary"
                      onClick={onClickValidate}
                      loading={isValidating}
                      onMouseEnter={() => setIsValidateHovered(true)}
                      onMouseLeave={() => setIsValidateHovered(false)}
                      style={{
                        color: settings.layout.theme === 'dark' ? '#000' : 'white',
                      }}
                    >
                      {!isValidating &&
                        (isValidateHovered || isInvalidApiKey ? (
                          t('onboarding.selectProvider.openaiApiKey.validate')
                        ) : (
                          <SmileOutlined style={{ fontSize: '20px' }} />
                        ))}
                    </Button>
                  </div>
                  <div
                    className={`sz:text-base ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.registered')}
                  </div>
                  <div className="sz:flex sz:flex-row sz:items-center sz:w-50 sz:mb-1 sz:wrap-normal sz:flex-wrap sz:gap-[1px]">
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={settings.apiKeys.openaiValidated ? 'success' : 'default'}
                    >
                      OpenAI
                    </Tag>
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={settings.apiKeys.geminiValidated ? 'success' : 'default'}
                    >
                      Gemini
                    </Tag>
                    <Tag
                      style={{ fontSize: '11px' }}
                      color={settings.apiKeys.anthropicValidated ? 'success' : 'default'}
                    >
                      Anthropic
                    </Tag>
                  </div>
                  <div
                    className={`sz:text-base ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.providerPreference')}
                  </div>
                  <Select
                    value={settings.models.providerPreference}
                    onChange={handleSelectProviderPreference}
                    className="sz:font-ycom sz:w-50"
                    placeholder={t('settings.automaticSelection')}
                    allowClear
                    options={[
                      {
                        value: 'openai',
                        label: 'OpenAI',
                        className: 'sz:font-ycom',
                        disabled: !settings.apiKeys.openaiValidated,
                      },
                      {
                        value: 'gemini',
                        label: 'Google Gemini',
                        className: 'sz:font-ycom',
                        disabled: !settings.apiKeys.geminiValidated,
                      },
                      {
                        value: 'anthropic',
                        label: 'Anthropic Claude',
                        className: 'sz:font-ycom',
                        disabled: !settings.apiKeys.anthropicValidated,
                      },
                    ]}
                  />
                  <div
                    className={`sz:text-base ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.chatModelSize')}
                  </div>
                  <Select
                    value={settings.models.chatSize || 'large'}
                    onChange={handleSelectChatSize}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'large',
                        label: t('settings.largeModel'),
                        className: 'sz:font-ycom',
                      },
                      {
                        value: 'small',
                        label: t('settings.smallModel'),
                        className: 'sz:font-ycom',
                      },
                    ]}
                  />
                  <div
                    className={`sz:text-small sz:text-gray-500 sz:text-center ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-600'
                    }`}
                  >
                    {t('settings.currentModel')}: {formatModelName(settings.models.chatModel || '')}
                  </div>
                  <div
                    className={`sz:text-base ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('settings.translateModelSize')}
                  </div>
                  <Select
                    value={settings.models.translateSize || 'small'}
                    onChange={handleSelectTranslateSize}
                    className="sz:font-ycom sz:w-50"
                    options={[
                      {
                        value: 'large',
                        label: t('settings.largeModel'),
                        className: 'sz:font-ycom',
                      },
                      {
                        value: 'small',
                        label: t('settings.smallModel'),
                        className: 'sz:font-ycom',
                      },
                    ]}
                  />
                  <div
                    className={`sz:text-small sz:text-gray-500 sz:text-center ${
                      settings.layout.theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-600'
                    }`}
                  >
                    {t('settings.currentModel')}:{' '}
                    {formatModelName(settings.models.translateModel || '')}
                  </div>
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
                      settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                    }`}
                  >
                    {t('layout.theme')}
                  </div>
                  <Select
                    value={settings.layout.theme}
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
                        settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                      }`}
                    >
                      {t('layout.menuButton')}
                    </div>
                    <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:w-50 sz:mt-2">
                      <Checkbox
                        checked={!settings.layout.showToggle}
                        onChange={handleToggleShowToggle}
                        className="sz:font-ycom sz:w-50 sz:flex sz:flex-row sz:items-center sz:justify-center"
                      >
                        {t('layout.hideToggle')}
                      </Checkbox>
                      <Button
                        className="sz:font-semibold sz:text-small sz:font-ycom sz:mt-2 sz:min-w-27"
                        type="primary"
                        onClick={handleResetTogglePosition}
                        style={{
                          color: settings.layout.theme === 'dark' ? '#000' : 'white',
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
                        settings.layout.theme === 'dark' ? 'sz:text-gray-200' : 'sz:text-gray-800'
                      }`}
                    >
                      {t('youtube.youtubeCaptionButton')}
                    </div>
                    <div className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:w-50 sz:mt-2">
                      <Checkbox
                        checked={!settings.layout.showYoutubeCaptionToggle}
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
