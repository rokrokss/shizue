import React from 'react';
import { Card, Typography, Space, Button, Tag } from 'antd';
import { GithubOutlined, QuestionCircleOutlined, BugOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph, Link } = Typography;

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Card>
        <Space direction="vertical" className="w-full" size="middle">
          <div className="text-center">
            <Title level={3}>Shizue</Title>
            <Text type="secondary">{t('settings.about.tagline')}</Text>
          </div>

          <div className="flex justify-between items-center">
            <Text>{t('settings.about.version')}</Text>
            <Tag color="blue">v1.0.0</Tag>
          </div>

          <div className="flex justify-between items-center">
            <Text>{t('settings.about.license')}</Text>
            <Tag>MIT</Tag>
          </div>

          <Paragraph type="secondary" className="text-sm">
            {t('settings.about.description')}
          </Paragraph>
        </Space>
      </Card>

      <Card title={t('settings.about.resources')}>
        <Space direction="vertical" className="w-full">
          <Button
            icon={<GithubOutlined />}
            block
            onClick={() => window.open('https://github.com/yagil/shizue', '_blank')}
          >
            {t('settings.about.github')}
          </Button>

          <Button
            icon={<QuestionCircleOutlined />}
            block
            onClick={() => window.open('https://github.com/yagil/shizue/wiki', '_blank')}
          >
            {t('settings.about.documentation')}
          </Button>

          <Button
            icon={<BugOutlined />}
            block
            onClick={() => window.open('https://github.com/yagil/shizue/issues', '_blank')}
          >
            {t('settings.about.reportIssue')}
          </Button>
        </Space>
      </Card>

      <Card title={t('settings.about.credits')}>
        <Paragraph type="secondary" className="text-sm mb-2">
          {t('settings.about.thankYou')}
        </Paragraph>
        <Space direction="vertical" size="small">
          <Link href="https://openai.com" target="_blank">
            OpenAI
          </Link>
          <Link href="https://google.com" target="_blank">
            Google Gemini
          </Link>
          <Link href="https://anthropic.com" target="_blank">
            Anthropic Claude
          </Link>
          <Link href="https://langchain.com" target="_blank">
            LangChain
          </Link>
        </Space>
      </Card>
    </div>
  );
};
