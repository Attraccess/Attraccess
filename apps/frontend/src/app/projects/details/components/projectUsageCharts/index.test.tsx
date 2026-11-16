import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectUsageCharts } from './index';
const state = vi.hoisted(() => ({
  data: undefined as
    | undefined
    | {
        summary: { currency: string; minorUnit: number };
        timeSeries: { date: string; minutes: number; machineMinutes: number; sessions: number; spend: number }[];
        topResources: {
          resourceId: number;
          resourceName: string;
          minutes: number;
          machineMinutes: number;
          sessions: number;
          spend: number;
        }[];
      },
  loading: false,
  active: true,
  lineData: [] as unknown[],
  barData: [] as unknown[],
  // last props per series dataKey / axis id, so the configured chart series and axes can be checked
  lines: {} as Record<string, Record<string, unknown>>,
  bars: {} as Record<string, Record<string, unknown>>,
  yAxes: {} as Record<string, { tickFormatter?: (value: number) => string }>,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
    // honours the options, so hours are checked for their one-decimal format
    useNumberFormatter: (options?: Intl.NumberFormatOptions) => (n: number) =>
      new Intl.NumberFormat('en', options).format(n),
    useDateTimeFormatter: () => (date: Date) => date.toISOString().slice(0, 10),
  }))()),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useProjectsServiceGetProjectUsageStats: () => ({ data: state.data, isLoading: state.loading }),
}));
// Replace chart layout/hover machinery while exercising the actual supplied tooltip renderers and transformed data.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  LineChart: ({ data, children }: { data: unknown[]; children: ReactNode }) => {
    state.lineData = data;
    return <section aria-label="time-series">{children}</section>;
  },
  BarChart: ({ data, children }: { data: unknown[]; children: ReactNode }) => {
    state.barData = data;
    return <section aria-label="top-resources">{children}</section>;
  },
  Tooltip: ({ content }: { content: (props: unknown) => ReactNode }) =>
    content({
      active: state.active,
      label: 'Selected point',
      payload: [
        { dataKey: 'spend', name: 'Money', value: '125', color: 'red' },
        { dataKey: 'personHours', name: 'Duration', value: 12.345 },
        { name: 'Missing', value: null },
      ],
    }),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: (props: { yAxisId?: string; tickFormatter?: (value: number) => string }) => {
    state.yAxes[props.yAxisId ?? 'topResources'] = props;
    return null;
  },
  Legend: () => null,
  Line: (props: { dataKey: string }) => {
    state.lines[props.dataKey] = props;
    return null;
  },
  Bar: (props: { dataKey: string }) => {
    state.bars[props.dataKey] = props;
    return null;
  },
  Rectangle: () => null,
}));
beforeEach(() => {
  state.data = undefined;
  state.loading = false;
  state.active = true;
  state.lineData = [];
  state.barData = [];
  state.lines = {};
  state.bars = {};
  state.yAxes = {};
});
afterEach(cleanup);
it('withholds empty-state messages while loading and shows them for empty results', () => {
  state.loading = true;
  const view = render(<ProjectUsageCharts projectId={7} />);
  expect(screen.queryByText('charts.timeSeries.empty')).toBeNull();
  view.unmount();
  state.loading = false;
  render(<ProjectUsageCharts projectId={7} />);
  expect(screen.getByText('charts.timeSeries.empty')).toBeTruthy();
  expect(screen.getByText('charts.topResources.empty')).toBeTruthy();
});
it('converts minor currency units, preserves invalid date labels and displays resource totals and tooltips', () => {
  state.data = {
    summary: { currency: 'EUR', minorUnit: 2 },
    timeSeries: [
      { date: '2026-01-02', minutes: 120, machineMinutes: 90, sessions: 2, spend: 1234 },
      { date: 'Unknown', minutes: 0, machineMinutes: 0, sessions: 0, spend: 0 },
    ],
    topResources: [
      { resourceId: 1, resourceName: 'Lathe', minutes: 100, machineMinutes: 45, sessions: 2, spend: 1234 },
    ],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(state.lineData).toEqual([
    { date: '2026-01-02', personHours: 2, machineHours: 1.5, sessions: 2, spend: 12.34 },
    { date: 'Unknown', personHours: 0, machineHours: 0, sessions: 0, spend: 0 },
  ]);
  expect(state.barData).toEqual([{ ...state.data.topResources[0], personHours: 100 / 60, machineHours: 0.75 }]);
  // resource, sessions, person hours, machine hours, spend
  const row = screen.getByText('Lathe').closest('tr');
  expect(Array.from(row?.querySelectorAll('th, td') ?? [], (cell) => cell.textContent)).toEqual([
    'Lathe',
    '2',
    '1.7',
    '0.8',
    'EUR 12.34',
  ]);
  expect(screen.getByText('charts.topResources.columns.personHours')).toBeTruthy();
  expect(screen.getByText('charts.topResources.columns.machineHours')).toBeTruthy();
  expect(screen.getByText('EUR 125')).toBeTruthy();
  expect(screen.getByText('EUR 1.25')).toBeTruthy();
  expect(screen.getAllByText('12.3')).toHaveLength(2);
  expect(screen.getAllByText('0')).toHaveLength(2);
});
it('draws person and machine hours as separate series, the machine line dashed', () => {
  state.data = {
    summary: { currency: 'EUR', minorUnit: 2 },
    timeSeries: [{ date: '2026-01-02', minutes: 60, machineMinutes: 60, sessions: 1, spend: 100 }],
    topResources: [{ resourceId: 1, resourceName: 'Saw', minutes: 60, machineMinutes: 60, sessions: 1, spend: 100 }],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(Object.keys(state.lines).sort()).toEqual(['machineHours', 'personHours', 'spend']);
  expect(state.lines.personHours).toMatchObject({ yAxisId: 'hours', name: 'tooltip.personHours' });
  expect(state.lines.personHours.strokeDasharray).toBeUndefined();
  expect(state.lines.machineHours).toMatchObject({
    yAxisId: 'hours',
    name: 'tooltip.machineHours',
    strokeDasharray: '2 3',
    legendType: 'plainline',
  });
  expect(state.lines.spend.strokeDasharray).toBe('6 4');
  expect(Object.keys(state.bars).sort()).toEqual(['machineHours', 'personHours', 'sessions']);
  expect(state.bars.personHours).toMatchObject({ name: 'tooltip.personHours' });
  expect(state.bars.machineHours).toMatchObject({ name: 'tooltip.machineHours' });
});
it('formats the hours axes with the hours formatter and leaves the spend axis alone', () => {
  state.data = {
    summary: { currency: 'EUR', minorUnit: 2 },
    timeSeries: [{ date: '2026-01-02', minutes: 60, machineMinutes: 60, sessions: 1, spend: 100 }],
    topResources: [{ resourceId: 1, resourceName: 'Saw', minutes: 60, machineMinutes: 60, sessions: 1, spend: 100 }],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(state.yAxes.hours.tickFormatter?.(2.46)).toBe('2.5');
  expect(state.yAxes.topResources.tickFormatter?.(2.46)).toBe('2.5');
  expect(state.yAxes.spend.tickFormatter).toBeUndefined();
});
it('hides tooltips when no point is active', () => {
  state.active = false;
  state.data = {
    summary: { currency: 'JPY', minorUnit: 0 },
    timeSeries: [{ date: '2026-01-02', minutes: 1, machineMinutes: 1, sessions: 1, spend: 100 }],
    topResources: [{ resourceId: 1, resourceName: 'Saw', minutes: 1, machineMinutes: 1, sessions: 1, spend: 100 }],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(screen.queryByText('Selected point')).toBeNull();
  expect(screen.getByText('JPY 100')).toBeTruthy();
});
