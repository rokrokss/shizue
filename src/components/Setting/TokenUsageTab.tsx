import { DailyUsage, fetchUsageData } from '@/services/usageService';
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Statistic, Table, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

interface TokenUsageTabProps {
  theme: Theme;
}

const TokenUsageTab = ({ theme }: TokenUsageTabProps) => {
  const { t } = useTranslation();
  const [usageData, setUsageData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchUsageData(2);
      setUsageData(data);
    } catch (err: any) {
      console.error('토큰 사용량 조회 오류:', err);
      setError(t('usage.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const columns: ColumnsType<DailyUsage> = [
    {
      title: t('usage.date'),
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => {
        const dateObj = new Date(date);
        return dateObj.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      },
    },
    {
      title: t('usage.inputTokens'),
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: t('usage.outputTokens'),
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: t('usage.totalTokens'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: t('usage.requests'),
      dataIndex: 'requestCount',
      key: 'requestCount',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: t('usage.models'),
      dataIndex: 'models',
      key: 'models',
      render: (models: string[]) => {
        if (models.length === 0) return '-';
        return models.join(', ');
      },
    },
  ];

  // 총합 계산
  const totals = usageData.reduce(
    (acc, day) => ({
      inputTokens: acc.inputTokens + day.inputTokens,
      outputTokens: acc.outputTokens + day.outputTokens,
      totalTokens: acc.totalTokens + day.totalTokens,
      requestCount: acc.requestCount + day.requestCount,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
  );

  if (error) {
    return (
      <div className="sz:p-4">
        <Alert
          message={t('usage.error')}
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={fetchData} loading={loading}>
              {t('usage.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="sz:p-4 sz:space-y-4">
      <div className="sz:flex sz:justify-between sz:items-center">
        <Title level={4} className="sz:m-0" style={{ color: theme === 'dark' ? 'white' : 'black' }}>
          {t('usage.title')}
        </Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading}
          type="primary"
          size="small"
        >
          {t('usage.refresh')}
        </Button>
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('usage.totalInputTokens')}
              value={totals.inputTokens}
              formatter={(value) => value?.toLocaleString()}
              valueStyle={{ color: theme === 'dark' ? 'white' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('usage.totalOutputTokens')}
              value={totals.outputTokens}
              formatter={(value) => value?.toLocaleString()}
              valueStyle={{ color: theme === 'dark' ? 'white' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('usage.totalTokens')}
              value={totals.totalTokens}
              formatter={(value) => value?.toLocaleString()}
              valueStyle={{ color: theme === 'dark' ? 'white' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('usage.totalRequests')}
              value={totals.requestCount}
              formatter={(value) => value?.toLocaleString()}
              valueStyle={{ color: theme === 'dark' ? 'white' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={usageData}
        loading={loading}
        pagination={false}
        rowKey="date"
        size="small"
        className="sz:mt-4"
        locale={{
          emptyText: t('usage.noData'),
        }}
      />
    </div>
  );
};

export default TokenUsageTab; 