// A chart the model writes as a ```chart code block. Anything that doesn't fit this shape stays a
// code block, so a wrong guess from a small model still shows its numbers.

export const CHART_TYPES = ['bar', 'line', 'area'] as const;

// The categorical palette has six validated slots; more series than that don't get a chart.
export const MAX_CHART_SERIES = 6;
const MAX_CHART_POINTS = 200;

export interface ChartSpec {
  type: (typeof CHART_TYPES)[number];
  title?: string;
  // The key in each data row that names its category or time.
  x: string;
  series: { key: string; name: string }[];
  data: Record<string, string | number>[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Values as numbers; "1,200" and "35%" from a model are numbers too.
const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const number = Number(value.replace(/[,%\s]/g, ''));
  return value.trim() && Number.isFinite(number) ? number : null;
};

export const parseChartSpec = (source: string): ChartSpec | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { type, title, x, series, data } = raw;
  if (!CHART_TYPES.includes(type as ChartSpec['type']) || typeof x !== 'string') return null;
  if (!Array.isArray(series) || series.length === 0 || series.length > MAX_CHART_SERIES) return null;
  if (!Array.isArray(data) || data.length === 0 || data.length > MAX_CHART_POINTS) return null;

  const lines = series.map((item) =>
    isRecord(item) && typeof item.key === 'string' && item.key !== x
      ? { key: item.key, name: typeof item.name === 'string' && item.name ? item.name : item.key }
      : null
  );
  if (lines.some((line) => line === null)) return null;

  const rows: ChartSpec['data'] = [];
  for (const row of data) {
    if (!isRecord(row) || (typeof row[x] !== 'string' && typeof row[x] !== 'number')) return null;
    const values = lines.map((line) => toNumber(row[line!.key]));
    if (values.some((value) => value === null)) return null;
    rows.push({
      [x]: row[x] as string | number,
      ...Object.fromEntries(lines.map((line, i) => [line!.key, values[i]!])),
    });
  }
  return {
    type: type as ChartSpec['type'],
    ...(typeof title === 'string' && title ? { title } : {}),
    x,
    series: lines as ChartSpec['series'],
    data: rows,
  };
};
