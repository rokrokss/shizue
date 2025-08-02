import React from 'react';
import { Card, Input, Button, Space, Typography, Alert, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  useOpenAIKeyValue,
  useGeminiKeyValue,
  useAnthropicKeyValue,
  useSetOpenAIKey,
  useSetGeminiKey,
  useSetAnthropicKey,
} from '@/hooks/settings';
import {
  useOpenAIValidatedValue,
  useGeminiValidatedValue,
  useAnthropicValidatedValue,
  useSetOpenAIValidated,
  useSetGeminiValidated,
  useSetAnthropicValidated,
} from '@/hooks/models';
import { validateApiKey } from '@/lib/validateApiKey';

const { Text, Paragraph } = Typography;

interface ApiKeyCardProps {
  provider: 'openai' | 'gemini' | 'anthropic';
  currentKey: string;
  isValidated: boolean;
  onSave: (key: string) => Promise<void>;
  onValidate: (key: string) => Promise<boolean>;
}

const ApiKeyCard: React.FC<ApiKeyCardProps> = ({
  provider,
  currentKey,
  isValidated,
  onSave,
  onValidate,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(currentKey);
  const [loading, setLoading] = React.useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const isValid = await onValidate(value);
      if (isValid) {
        await onSave(value);
        message.success(t('settings.apiKeys.saveSuccess'));
        setEditing(false);
      } else {
        message.error(t('settings.apiKeys.invalidKey'));
      }
    } catch {
      message.error(t('settings.apiKeys.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const providerInfo = {
    openai: {
      name: 'OpenAI',
      description: t('settings.apiKeys.openaiDescription'),
      helpUrl: 'https://platform.openai.com/api-keys',
    },
    gemini: {
      name: 'Google Gemini',
      description: t('settings.apiKeys.geminiDescription'),
      helpUrl: 'https://aistudio.google.com/app/apikey',
    },
    anthropic: {
      name: 'Anthropic Claude',
      description: t('settings.apiKeys.anthropicDescription'),
      helpUrl: 'https://console.anthropic.com/settings/keys',
    },
  }[provider];

  return (
    <Card
      title={providerInfo.name}
      extra={
        isValidated ? (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
        ) : currentKey ? (
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
        ) : null
      }
    >
      <Paragraph type="secondary" className="mb-3">
        {providerInfo.description}
      </Paragraph>

      {editing ? (
        <Space direction="vertical" className="w-full">
          <Input.Password
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`sk-...`}
            size="large"
          />
          <Space>
            <Button type="primary" onClick={handleSave} loading={loading}>
              {t('common.save')}
            </Button>
            <Button
              onClick={() => {
                setValue(currentKey);
                setEditing(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" className="w-full">
          <div className="flex justify-between items-center">
            <Text>
              {currentKey
                ? `${currentKey.substring(0, 7)}...${currentKey.substring(currentKey.length - 4)}`
                : t('settings.apiKeys.notSet')}
            </Text>
            <Button onClick={() => setEditing(true)}>
              {currentKey ? t('common.edit') : t('common.add')}
            </Button>
          </div>

          <a
            href={providerInfo.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
          >
            {t('settings.apiKeys.getApiKey')} →
          </a>
        </Space>
      )}
    </Card>
  );
};

export const ApiKeySettings: React.FC = () => {
  const { t } = useTranslation();

  const openAIKey = useOpenAIKeyValue();
  const geminiKey = useGeminiKeyValue();
  const anthropicKey = useAnthropicKeyValue();

  const openAIValidated = useOpenAIValidatedValue();
  const geminiValidated = useGeminiValidatedValue();
  const anthropicValidated = useAnthropicValidatedValue();

  const setOpenAIKey = useSetOpenAIKey();
  const setGeminiKey = useSetGeminiKey();
  const setAnthropicKey = useSetAnthropicKey();

  const setOpenAIValidated = useSetOpenAIValidated();
  const setGeminiValidated = useSetGeminiValidated();
  const setAnthropicValidated = useSetAnthropicValidated();

  const hasAnyKey = openAIKey || geminiKey || anthropicKey;

  return (
    <div className="space-y-4" id="api-keys-section">
      {!hasAnyKey && (
        <Alert
          message={t('settings.apiKeys.noKeysTitle')}
          description={t('settings.apiKeys.noKeysDescription')}
          type="warning"
          showIcon
        />
      )}

      <ApiKeyCard
        provider="openai"
        currentKey={openAIKey}
        isValidated={openAIValidated ?? false}
        onSave={async (key) => {
          setOpenAIKey(key);
          setOpenAIValidated(true);
        }}
        onValidate={async (key) => {
          const isValid = await validateApiKey(key, 'openai-api-key');
          setOpenAIValidated(isValid);
          return isValid;
        }}
      />

      <ApiKeyCard
        provider="gemini"
        currentKey={geminiKey}
        isValidated={geminiValidated ?? false}
        onSave={async (key) => {
          setGeminiKey(key);
          setGeminiValidated(true);
        }}
        onValidate={async (key) => {
          const isValid = await validateApiKey(key, 'gemini-api-key');
          setGeminiValidated(isValid);
          return isValid;
        }}
      />

      <ApiKeyCard
        provider="anthropic"
        currentKey={anthropicKey}
        isValidated={anthropicValidated ?? false}
        onSave={async (key) => {
          setAnthropicKey(key);
          setAnthropicValidated(true);
        }}
        onValidate={async (key) => {
          const isValid = await validateApiKey(key, 'anthropic-api-key');
          setAnthropicValidated(isValid);
          return isValid;
        }}
      />

      <Alert
        message={t('settings.apiKeys.securityNote')}
        description={t('settings.apiKeys.securityDescription')}
        type="info"
        showIcon
      />
    </div>
  );
};
