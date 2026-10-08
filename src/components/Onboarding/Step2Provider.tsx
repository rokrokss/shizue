import { LoadingLabel } from '@/components/Loader/LoadingLabel';
import LocalModelSettings from '@/components/Setting/LocalModelSettings';
import ChatGPTSettings from '@/components/Setting/ChatGPTSettings';
import { useThemeValue } from '@/hooks/layout';
import {
  defaultAnthropicChatModel,
  defaultAnthropicTranslateModel,
  defaultGeminiChatModel,
  defaultGeminiTranslateModel,
  defaultOpenAIChatModel,
  defaultOpenAITranslateModel,
  defaultOpenRouterChatModel,
  defaultOpenRouterTranslateModel,
  useSetAnthropicValidated,
  useChatModel,
  useSetGeminiValidated,
  useSetOpenAIValidated,
  useSetOpenRouterValidated,
  useTranslateModel,
  useProviderModelPreferences,
} from '@/hooks/models';
import {
  useSetAnthropicKey,
  useSetGeminiKey,
  useSetOpenAIKey,
  useSetOpenRouterKey,
} from '@/hooks/settings';
import { ApiKeyProvider, LocalModelRef } from '@/lib/modelRegistry';
import { rememberProviderModels } from '@/lib/modelPreferences';
import { validateApiKey } from '@/lib/validateApiKey';
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
  const [isChatGPTWelcomeVisible, setIsChatGPTWelcomeVisible] = useState(false);
  const [apiKey, setApiKey] = useState(
    process.env.NODE_ENV === 'development' ? import.meta.env.WXT_OPENROUTER_API_KEY : ''
  );
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState<ApiKeyProvider | 'local' | 'chatgpt'>(
    'chatgpt'
  );
  const setOpenAIKey = useSetOpenAIKey();
  const setGeminiKey = useSetGeminiKey();
  const setAnthropicKey = useSetAnthropicKey();
  const setOpenRouterKey = useSetOpenRouterKey();
  const [chatModel, setChatModel] = useChatModel();
  const [translateModel, setTranslateModel] = useTranslateModel();
  const [modelPreferences, setModelPreferences] = useProviderModelPreferences();
  const theme = useThemeValue();
  const setOpenAIValidated = useSetOpenAIValidated();
  const setGeminiValidated = useSetGeminiValidated();
  const setAnthropicValidated = useSetAnthropicValidated();
  const setOpenRouterValidated = useSetOpenRouterValidated();
  const lines = [
    t('onboarding.selectProvider.title'),
    selectedProvider === 'chatgpt' ? '' : selectedProvider === 'local'
      ? t('local.description')
      : t('onboarding.selectProvider.openaiApiKey.description_0'),
    selectedProvider === 'local' || selectedProvider === 'chatgpt'
      ? ''
      : selectedProvider === 'openrouter-api-key'
      ? t('onboarding.selectProvider.openRouterApiKey.description')
      : t('onboarding.selectProvider.openaiApiKey.description_1'),
  ];

  const handleSelect = (value: string) => {
    setSelectedProvider(value as ApiKeyProvider | 'local' | 'chatgpt');
    setApiKey('');
    setCanProceed(false);
  };

  const onLocalModelPicked = (model: LocalModelRef) => {
    setChatModel(model);
    setTranslateModel(model);
    setCanProceed(true);
  };

  const onClickValidate = async () => {
    if (selectedProvider === 'local' || selectedProvider === 'chatgpt' || isLoading) return;
    setIsLoading(true);
    const trimmedKey = apiKey.trim();
    const isValid = await validateApiKey(trimmedKey, selectedProvider);
    if (isValid) {
      if (selectedProvider === 'openrouter-api-key') {
        setOpenRouterKey(trimmedKey);
        setChatModel(defaultOpenRouterChatModel);
        setTranslateModel(defaultOpenRouterTranslateModel);
        setOpenRouterValidated(true);
      } else if (selectedProvider === 'openai-api-key') {
        setOpenAIKey(trimmedKey);
        setChatModel(defaultOpenAIChatModel);
        setTranslateModel(defaultOpenAITranslateModel);
        setOpenAIValidated(true);
      } else if (selectedProvider === 'gemini-api-key') {
        setGeminiKey(trimmedKey);
        setChatModel(defaultGeminiChatModel);
        setTranslateModel(defaultGeminiTranslateModel);
        setGeminiValidated(true);
      } else if (selectedProvider === 'anthropic-api-key') {
        setAnthropicKey(trimmedKey);
        setChatModel(defaultAnthropicChatModel);
        setTranslateModel(defaultAnthropicTranslateModel);
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

  const onClickNext = () => {
    setModelPreferences(rememberProviderModels(modelPreferences, selectedProvider, { chat: chatModel, translation: translateModel }));
    debugLog('Onboarding: [onClickNext] navigate to /chat');
    navigate('/chat');
  };

  return (
    <div className="sz:flex sz:flex-col sz:pt-30">
      {!isChatGPTWelcomeVisible && <>
      <div className="sz:text-lg whitespace-pre-wrap sz:min-h-13 sz:w-80 sz:flex sz:items-center sz:justify-center">
        {lines[0]}
      </div>
      <Select
        value={selectedProvider}
        onChange={handleSelect}
        className="sz:font-ycom sz:w-80 sz:min-w-0 sz:max-w-full"
        options={[
          { value: 'chatgpt', label: t('chatgpt.providerTitle'), className: 'sz:font-ycom' },
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
            value: 'local',
            label: t('local.providerTitle'),
            className: 'sz:font-ycom',
          },
        ]}
      />
      {(lines[1] || lines[2]) && <div
        className={`
          sz:flex
          sz:flex-col
          sz:items-start
          sz:w-80
          sz:text-sm
          ${theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-500'}
          sz:pl-1
          sz:pt-[3px]
          sz:mb-3
        `}
      >
        <div>{lines[1]}</div>
        <div>{lines[2]}</div>
      </div>}
      </>}
      {selectedProvider === 'chatgpt' ? (
        <ChatGPTSettings className="sz:w-80 sz:mt-1" onReadyChange={setCanProceed} onWelcomeChange={setIsChatGPTWelcomeVisible} onWelcomeConfirmed={onClickNext} onConnected={(chat, translation) => {
          setChatModel(chat); setTranslateModel(translation); setCanProceed(true);
        }} />
      ) : selectedProvider === 'local' ? (
        <LocalModelSettings className="sz:w-80" pickModel onModelPicked={onLocalModelPicked} />
      ) : (
        <div className="sz:flex sz:flex-row sz:items-center sz:w-80">
          <Input
            placeholder={
              selectedProvider === 'openai-api-key'
                ? 'sk-proj-XXX......'
                : selectedProvider === 'gemini-api-key'
                ? 'AQ.XXX......'
                : selectedProvider === 'anthropic-api-key'
                ? 'sk-ant-api03-XXX......'
                : selectedProvider === 'openrouter-api-key'
                ? 'sk-or-v1-XXX......'
                : ''
            }
            className="sz:font-ycom sz:mr-[5px]"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            status={isInvalidApiKey ? 'error' : undefined}
          />
          <Button
            className="sz:font-semibold sz:text-base sz:font-ycom"
            type="primary"
            onClick={onClickValidate}
          >
            <LoadingLabel loading={isLoading}>
              {canProceed ? (
                <SmileOutlined style={{ fontSize: '20px' }} />
              ) : (
                t('onboarding.selectProvider.openaiApiKey.validate')
              )}
            </LoadingLabel>
          </Button>
        </div>
      )}
      {!isChatGPTWelcomeVisible && <Button
        className={`sz:mt-2 sz:font-semibold sz:text-base sz:font-ycom ${
          theme == 'dark' ? 'sz:text-black' : ''
        }`}
        type="primary"
        disabled={!canProceed || isLoading}
        onClick={onClickNext}
      >
        {t('onboarding.next')}
      </Button>}
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
