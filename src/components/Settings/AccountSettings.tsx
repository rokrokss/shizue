import React from 'react';
import { Card, Avatar, Button, Space, Typography, Divider, Tag, message } from 'antd';
import { LogoutOutlined, UserOutlined, MailOutlined, CalendarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/components/Auth/AuthProvider';
import { formatDistanceToNow } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';

const { Title, Text, Paragraph } = Typography;

export const AccountSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthContext();
  const [logoutLoading, setLogoutLoading] = React.useState(false);

  const handleLogout = async () => {
    try {
      setLogoutLoading(true);
      await logout();
      message.success(t('auth.logoutSuccess'));
    } catch {
      message.error(t('auth.logoutError'));
    } finally {
      setLogoutLoading(false);
    }
  };

  if (!user) {
    return (
      <Card className="w-full">
        <div className="text-center py-8">
          <Text type="secondary">{t('settings.account.notLoggedIn')}</Text>
        </div>
      </Card>
    );
  }

  const locale = i18n.language === 'ko' ? ko : enUS;
  const memberSince = user.created_at
    ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale })
    : t('settings.account.unknown');

  return (
    <div className="space-y-4">
      {/* User Profile Card */}
      <Card>
        <div className="flex items-center space-x-4 mb-4">
          <Avatar
            size={64}
            src={user.profile_picture}
            icon={!user.profile_picture && <UserOutlined />}
          />
          <div className="flex-1">
            <Title level={4} className="mb-1">
              {user.name || t('settings.account.unnamed')}
            </Title>
            <Space direction="vertical" size={0}>
              <Text type="secondary" className="flex items-center">
                <MailOutlined className="mr-1" />
                {user.email}
              </Text>
              <Text type="secondary" className="flex items-center">
                <CalendarOutlined className="mr-1" />
                {t('settings.account.memberSince')}: {memberSince}
              </Text>
            </Space>
          </div>
        </div>

        <Divider />

        {/* Account Status */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Text>{t('settings.account.status')}</Text>
            <Tag color="green">{t('settings.account.active')}</Tag>
          </div>

          <div className="flex justify-between items-center">
            <Text>{t('settings.account.accountType')}</Text>
            <Tag>{t('settings.account.google')}</Tag>
          </div>

          <div className="flex justify-between items-center">
            <Text>{t('settings.account.language')}</Text>
            <Text strong>{user.locale || 'en'}</Text>
          </div>
        </div>

        <Divider />

        {/* Actions */}
        <Space direction="vertical" className="w-full">
          <Button
            type="primary"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            loading={logoutLoading}
            block
          >
            {t('auth.logout')}
          </Button>

          <Paragraph type="secondary" className="text-xs mb-0">
            {t('settings.account.logoutDescription')}
          </Paragraph>
        </Space>
      </Card>

      {/* API Keys Card */}
      <Card title={t('settings.account.apiKeys')}>
        <Paragraph type="secondary">{t('settings.account.apiKeysDescription')}</Paragraph>
        <Button
          type="default"
          onClick={() => {
            // Navigate to API keys section
            const element = document.getElementById('api-keys-section');
            element?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          {t('settings.account.manageApiKeys')}
        </Button>
      </Card>

      {/* Data & Privacy Card */}
      <Card title={t('settings.account.dataPrivacy')}>
        <Space direction="vertical" className="w-full">
          <div className="flex justify-between items-center">
            <Text>{t('settings.account.dataStorage')}</Text>
            <Tag color="blue">{t('settings.account.local')}</Tag>
          </div>

          <Paragraph type="secondary" className="text-xs mb-2">
            {t('settings.account.dataStorageDescription')}
          </Paragraph>

          <Divider />

          <div className="space-y-2">
            <Button type="default" block disabled>
              {t('settings.account.exportData')} ({t('common.comingSoon')})
            </Button>
            <Button type="default" danger block disabled>
              {t('settings.account.deleteAccount')} ({t('common.comingSoon')})
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  );
};
