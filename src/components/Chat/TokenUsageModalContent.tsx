import { useThemeValue } from '@/hooks/layout';
import { debugLog } from '@/logs';
import { DailyUsage, fetchUsageData } from '@/services/usageService';
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const { Title } = Typography;

interface ChartData {
  date: string;
  dateFormatted: string;
  [key: string]: string | number; // Token data by model
}

const MODEL_COLORS = {
  'gpt-4.1': '#32CCBC',
  'gpt-4.1-mini': '#ABDCFF',
  'gemini-2.5-flash': '#FFF6B7',
  'gemini-2.5-flash-lite-preview-06-17': '#CE9FFC',
  default: '#32CCBC',
};

const TokenUsageModalContent = () => {
  const theme = useThemeValue();
  const { t } = useTranslation();
  const [usageData, setUsageData] = useState<DailyUsage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setIsHydrated(true);
    setError(null);

    try {
      const data = await fetchUsageData(7); // Changed to 7 days
      setUsageData(data);
    } catch (err: any) {
      console.error('Token usage fetch error:', err);
      setError(t('usage.fetchError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const chartData: ChartData[] = usageData.map((day) => {
    const chartItem: ChartData = {
      date: day.date,
      dateFormatted: new Date(day.date).toLocaleDateString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
      }),
    };

    // Add actual token count for each model
    day.modelUsage.forEach((modelUsage) => {
      chartItem[modelUsage.model] = modelUsage.totalTokens;
    });

    return chartItem;
  });

  const allModels = Array.from(
    new Set(usageData.flatMap((day) => day.modelUsage.map((m) => m.model)))
  );

  debugLog('TokenUsageTab [allModels]', allModels);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);

      return (
        <div
          className={`sz:p-4 sz:rounded-lg sz:border sz:font-ycom ${
            theme === 'dark'
              ? 'sz:bg-gray-800 sz:text-white sz:border-gray-600'
              : 'sz:bg-white sz:text-black sz:border-gray-200'
          }`}
        >
          <p className="sz:font-semibold sz:mb-2 sz:text-sm sz:font-ycom">{label}</p>
          {payload
            .filter((entry: any) => entry.value > 0)
            .map((entry: any, index: number) => (
              <div
                key={index}
                className="sz:flex sz:justify-between sz:items-center sz:mb-1 sz:font-ycom"
              >
                <div className="sz:flex sz:items-center">
                  <div
                    className="sz:w-3 sz:h-3 sz:rounded-full sz:mr-2"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="sz:text-xs sz:font-ycom">{entry.dataKey}</span>
                </div>
                <span className="sz:text-xs sz:font-ycom sz:ml-4">
                  {entry.value?.toLocaleString()}
                </span>
              </div>
            ))}
          {total > 0 && (
            <div
              className={`sz:border-t sz:mt-2 sz:pt-2 sz:font-ycom ${
                theme === 'dark' ? 'sz:border-gray-600' : 'sz:border-gray-200'
              }`}
            >
              <div className="sz:flex sz:justify-between sz:items-center sz:font-ycom">
                <span className="sz:text-sm sz:font-semibold sz:font-ycom">
                  {t('usage.total')}:
                </span>
                <span className="sz:text-xs sz:font-ycom sz:font-semibold">
                  {total.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="sz:p-4 sz:font-ycom">
        <Alert
          message={t('usage.error')}
          description={error}
          type="error"
          showIcon
          className="sz:font-ycom"
          action={
            <Button size="small" onClick={fetchData} className="sz:font-ycom">
              {t('usage.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .recharts-surface:focus {
            outline: none !important;
          }
        `}
      </style>
      <div
        className={`sz:text-lg sz:font-semibold sz:mb-4 sz:text-center ${
          theme == 'dark' ? 'sz:text-white' : 'sz:text-black'
        } sz:flex sz:justify-center sz:items-center sz:gap-1`}
      >
        {t('usage.title')}
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchData}
          type="text"
          size="small"
          className="sz:font-ycom"
        />
      </div>
      <div className="sz:flex sz:flex-col sz:gap-3 sz:overflow-y-auto sz:scrollbar-hidden sz:max-h-[70vh]">
        {allModels.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme === 'dark' ? '#2a2a2a' : '#f5f5f5'}
                vertical={false}
              />
              <XAxis
                dataKey="dateFormatted"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 12,
                  fill: theme === 'dark' ? '#888' : '#666',
                }}
              />
              <YAxis hide={true} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: theme === 'dark' ? '#111' : '#eee' }}
                isAnimationActive={false}
              />
              <Legend
                wrapperStyle={{
                  color: theme === 'dark' ? '#ccc' : '#666',
                  fontSize: '12px',
                  paddingTop: '12px',
                }}
                iconType="circle"
              />
              {allModels.map((model, index) => (
                <Bar
                  isAnimationActive={false}
                  key={model}
                  dataKey={model}
                  stackId="tokens"
                  fill={MODEL_COLORS[model as keyof typeof MODEL_COLORS] || MODEL_COLORS.default}
                  name={model}
                  radius={index === allModels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="sz:flex sz:flex-col sz:items-center sz:justify-center sz:text-center sz:font-ycom"
            style={{ height: isHydrated && !isLoading ? '100px' : '300px' }}
          >
            <div
              className={`sz:text-base sz:font-medium sz:mb-1 sz:font-ycom ${
                theme === 'dark' ? 'sz:text-gray-400' : 'sz:text-gray-600'
              }`}
            >
              {isHydrated && !isLoading && t('usage.noData')}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default TokenUsageModalContent;
