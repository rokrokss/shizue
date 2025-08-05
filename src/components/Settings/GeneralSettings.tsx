import React from 'react';
import { Card, Select, Switch, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useSettings';

const { Text } = Typography;

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();
  const [theme, setTheme] = useTheme();

  const languages = [
    { value: 'English', label: 'English' },
    { value: 'Korean_한국어', label: '한국어' },
    { value: 'Japanese_日本語', label: '日本語' },
    { value: 'ChineseSimplified_简体中文', label: '简体中文' },
    { value: 'ChineseTraditional_繁體中文', label: '繁體中文' },
    { value: 'Spanish_Español', label: 'Español' },
    { value: 'French_Français', label: 'Français' },
    { value: 'German_Deutsch', label: 'Deutsch' },
    { value: 'PortugueseBR_Português', label: 'Português (BR)' },
    { value: 'Russian_Русский', label: 'Русский' },
  ];

  return (
    <div className="space-y-4">
      <Card title={t('settings.general.appearance')}>
        <Space direction="vertical" className="w-full" size="middle">
          <div className="flex justify-between items-center">
            <Text>{t('settings.general.theme')}</Text>
            <Select
              value={theme}
              onChange={setTheme}
              style={{ width: 120 }}
              options={[
                { value: 'light', label: t('settings.general.light') },
                { value: 'dark', label: t('settings.general.dark') },
                { value: 'system', label: t('settings.general.system') },
              ]}
            />
          </div>

          <div className="flex justify-between items-center">
            <Text>{t('settings.general.language')}</Text>
            <Select
              value={lang}
              onChange={(value) => {
                setLang(value);
              }}
              style={{ width: 150 }}
              options={languages}
            />
          </div>
        </Space>
      </Card>

      <Card title={t('settings.general.behavior')}>
        <Space direction="vertical" className="w-full" size="middle">
          <div className="flex justify-between items-center">
            <div>
              <Text>{t('settings.general.autoSave')}</Text>
              <br />
              <Text type="secondary" className="text-xs">
                {t('settings.general.autoSaveDescription')}
              </Text>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex justify-between items-center">
            <div>
              <Text>{t('settings.general.notifications')}</Text>
              <br />
              <Text type="secondary" className="text-xs">
                {t('settings.general.notificationsDescription')}
              </Text>
            </div>
            <Switch defaultChecked />
          </div>
        </Space>
      </Card>
    </div>
  );
};
