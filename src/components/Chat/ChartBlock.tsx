import { useThemeValue } from '@/hooks/layout';
import type { ChartSpec } from '@/lib/chartSpec';
import { Button } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// The categorical slots in their fixed order, each stepped for its surface; checked with the
// dataviz palette validator against the chat's white and #1C1D26 backgrounds.
const SERIES_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
};

const TOKENS = {
  light: { surface: '#ffffff', text: '#0b0b0b', muted: '#898781', grid: '#e1e0d9', cursor: '#f3f3f1' },
  dark: { surface: '#1C1D26', text: '#f0efec', muted: '#898781', grid: '#2E303B', cursor: '#262833' },
};

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat();

// A ```chart block from the model as a chart, with its numbers one click away as a table.
// Light-mode slots below 3:1 contrast on white get the legend and the table as their relief.
const ChartBlock = ({ spec }: { spec: ChartSpec }) => {
  const { t } = useTranslation();
  const theme = useThemeValue() === 'dark' ? 'dark' : 'light';
  const tokens = TOKENS[theme];
  const colors = SERIES_COLORS[theme];
  const [asTable, setAsTable] = useState(false);

  const axes = [
    <CartesianGrid key="grid" vertical={false} stroke={tokens.grid} strokeWidth={1} />,
    <XAxis
      key="x"
      dataKey={spec.x}
      axisLine={{ stroke: tokens.grid }}
      tickLine={false}
      tick={{ fontSize: 11, fill: tokens.muted }}
      interval="preserveStartEnd"
      minTickGap={8}
    />,
    <YAxis
      key="y"
      axisLine={false}
      tickLine={false}
      width={40}
      tick={{ fontSize: 11, fill: tokens.muted }}
      tickFormatter={(value: number) => compact.format(value)}
    />,
    <Tooltip
      key="tooltip"
      isAnimationActive={false}
      cursor={spec.type === 'bar' ? { fill: tokens.cursor } : { stroke: tokens.muted, strokeWidth: 1 }}
      content={({ active, label, payload }) =>
        active && payload?.length ? (
          <div
            className="sz:rounded-md sz:px-2.5 sz:py-1.5 sz:text-xs sz:shadow-md"
            style={{ background: tokens.surface, color: tokens.text, border: `1px solid ${tokens.grid}` }}
          >
            <div className="sz:mb-1" style={{ color: tokens.muted }}>
              {label}
            </div>
            {payload.map((item, index) => (
              <div key={String(item.dataKey)} className="sz:flex sz:items-center sz:gap-1.5">
                <span
                  className="sz:inline-block sz:w-2 sz:h-2 sz:rounded-full"
                  style={{ background: colors[spec.series.findIndex((s) => s.key === item.dataKey)] ?? colors[index] }}
                />
                <span>{item.name}</span>
                <span className="sz:ml-auto sz:pl-3 sz:tabular-nums">
                  {full.format(Number(item.value))}
                </span>
              </div>
            ))}
          </div>
        ) : null
      }
    />,
  ];

  const margin = { top: 8, right: 8, left: 0, bottom: 0 };
  const chart =
    spec.type === 'bar' ? (
      <BarChart data={spec.data} margin={margin} barGap={2} barCategoryGap="20%">
        {axes}
        {spec.series.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.name}
            fill={colors[index]}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    ) : spec.type === 'line' ? (
      <LineChart data={spec.data} margin={margin}>
        {axes}
        {spec.series.map((series, index) => (
          <Line
            key={series.key}
            dataKey={series.key}
            name={series.name}
            type="monotone"
            stroke={colors[index]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: colors[index], stroke: tokens.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    ) : (
      <AreaChart data={spec.data} margin={margin}>
        {axes}
        {spec.series.map((series, index) => (
          <Area
            key={series.key}
            dataKey={series.key}
            name={series.name}
            type="monotone"
            stroke={colors[index]}
            strokeWidth={2}
            fill={colors[index]}
            fillOpacity={0.1}
            activeDot={{ r: 4, fill: colors[index], stroke: tokens.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );

  return (
    <figure className="sz-chart sz:my-2 sz:mx-0 sz:w-full sz:font-ddin" style={{ color: tokens.text }}>
      <div className="sz:flex sz:items-start sz:justify-between sz:gap-2">
        <figcaption className="sz:text-sm sz:font-semibold">
          {spec.title ?? (spec.series.length === 1 ? spec.series[0].name : '')}
        </figcaption>
        <Button
          type="text"
          size="small"
          className="sz:font-ycom sz:text-xs sz:shrink-0"
          onClick={() => setAsTable((value) => !value)}
        >
          {asTable ? t('chat.showChart') : t('chat.showTable')}
        </Button>
      </div>
      {spec.series.length > 1 ? (
        <div className="sz:flex sz:flex-wrap sz:gap-x-3 sz:gap-y-1 sz:text-xs sz:mt-1">
          {spec.series.map((series, index) => (
            <span key={series.key} className="sz:flex sz:items-center sz:gap-1.5">
              <span className="sz:inline-block sz:w-2 sz:h-2 sz:rounded-full" style={{ background: colors[index] }} />
              {series.name}
            </span>
          ))}
        </div>
      ) : null}
      {asTable ? (
        <div className="sz:overflow-x-auto sz:mt-2">
          <table className="sz:w-full sz:text-xs sz:border-collapse">
            <thead>
              <tr style={{ color: tokens.muted }}>
                <th className="sz:text-left sz:font-normal sz:py-1 sz:pr-3">{spec.x}</th>
                {spec.series.map((series) => (
                  <th key={series.key} className="sz:text-right sz:font-normal sz:py-1 sz:pl-3">
                    {series.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.data.map((row, index) => (
                <tr key={index} style={{ borderTop: `1px solid ${tokens.grid}` }}>
                  <td className="sz:py-1 sz:pr-3">{row[spec.x]}</td>
                  {spec.series.map((series) => (
                    <td key={series.key} className="sz:text-right sz:py-1 sz:pl-3 sz:tabular-nums">
                      {full.format(Number(row[series.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sz:h-52 sz:mt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
};

export default ChartBlock;
