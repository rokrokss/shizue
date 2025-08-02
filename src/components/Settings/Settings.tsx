import React, { useState } from 'react';
import { Tabs, Typography } from 'antd';
import { UserOutlined, KeyOutlined, SettingOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AccountSettings } from './AccountSettings';
import { ApiKeySettings } from './ApiKeySettings';
import { GeneralSettings } from './GeneralSettings';
import { AboutSettings } from './AboutSettings';

const { Title } = Typography;

export const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState('account');

  const items = [
    {
      key: 'account',
      label: (
        <span>
          <UserOutlined />
          {t('settings.tabs.account')}
        </span>
      ),
      children: <AccountSettings />,
    },
    {
      key: 'apiKeys',
      label: (
        <span>
          <KeyOutlined />
          {t('settings.tabs.apiKeys')}
        </span>
      ),
      children: <ApiKeySettings />,
    },
    {
      key: 'general',
      label: (
        <span>
          <SettingOutlined />
          {t('settings.tabs.general')}
        </span>
      ),
      children: <GeneralSettings />,
    },
    {
      key: 'about',
      label: (
        <span>
          <InfoCircleOutlined />
          {t('settings.tabs.about')}
        </span>
      ),
      children: <AboutSettings />,
    },
  ];

  return (
    <div className="p-4">
      <Title level={3} className="mb-4">
        {t('settings.title')}
      </Title>

      <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} className="settings-tabs" />
    </div>
  );
};
