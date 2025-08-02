import React from 'react';
import { Button, Avatar, Dropdown, Spin } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuthContext } from './AuthProvider';
import { useTranslation } from 'react-i18next';

export function LoginButton() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, user, login, logout } = useAuthContext();

  if (isLoading) {
    return <Spin size="small" />;
  }

  if (!isAuthenticated) {
    return (
      <Button type="primary" icon={<UserOutlined />} onClick={login} loading={isLoading}>
        {t('auth.loginWithGoogle')}
      </Button>
    );
  }

  const menuItems = [
    {
      key: 'profile',
      label: user?.email,
      disabled: true,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      label: t('auth.logout'),
      icon: <LogoutOutlined />,
      onClick: logout,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
      <Avatar
        src={user?.profile_picture}
        icon={<UserOutlined />}
        style={{ cursor: 'pointer' }}
        size="small"
      />
    </Dropdown>
  );
}
