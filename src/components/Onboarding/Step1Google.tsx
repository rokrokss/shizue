import React from 'react';
import { Button, Typography, Space } from 'antd';
import { GoogleOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/components/Auth/AuthProvider';

const { Title, Text } = Typography;

interface Step1GoogleProps {
  onNext: () => void;
}

export const Step1Google: React.FC<Step1GoogleProps> = ({ onNext }) => {
  const { t } = useTranslation();
  const { login, isLoading } = useAuthContext();

  const handleGoogleLogin = async () => {
    try {
      await login();
      // Login successful, move to next step
      onNext();
    } catch (error) {
      console.error('Login failed:', error);
      // Error handling is done in the login function
    }
  };

  return (
    <div className="flex flex-col items-center justify-center px-8 py-16">
      <Space direction="vertical" size={32} align="center" className="w-full max-w-md">
        <UserOutlined style={{ fontSize: 64, color: '#1890ff' }} />

        <div className="text-center">
          <Title level={2} className="mb-4">
            {t('onboarding.step1.title')}
          </Title>
          <Text className="text-gray-600">{t('onboarding.step1.description')}</Text>
        </div>

        <Space direction="vertical" size={16} className="w-full">
          <Button
            type="primary"
            size="large"
            icon={<GoogleOutlined />}
            onClick={handleGoogleLogin}
            loading={isLoading}
            block
            className="h-12"
          >
            {t('auth.loginWithGoogle')}
          </Button>

          <Text type="secondary" className="text-center text-xs">
            {t('onboarding.step1.privacy')}
          </Text>
        </Space>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <Title level={5} className="mb-2">
            {t('onboarding.step1.whyLogin.title')}
          </Title>
          <ul className="space-y-2 text-sm">
            <li>• {t('onboarding.step1.whyLogin.backup')}</li>
            <li>• {t('onboarding.step1.whyLogin.sync')}</li>
            <li>• {t('onboarding.step1.whyLogin.usage')}</li>
          </ul>
        </div>
      </Space>
    </div>
  );
};
