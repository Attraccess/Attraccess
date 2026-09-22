import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectUsageCharts } from './index';
const state = vi.hoisted(() => ({
  data: undefined as
    | undefined
    | {
        summary: { currency: string; minorUnit: number };
        timeSeries: { date: string; minutes: number; sessions: number; spend: number }[];
        topResources: { resourceId: number; resourceName: string; minutes: number; sessions: number; spend: number }[];
      },
  loading: false,
  active: true,
  lineData: [] as unknown[],
  barData: [] as unknown[],
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useNumberFormatter: () => (n: number) => n.toFixed(2),
  useDateTimeFormatter: () => (date: Date) => date.toISOString().slice(0, 10),
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
        { dataKey: 'minutes', name: 'Duration', value: 12 },
        { name: 'Missing', value: null },
      ],
    }),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Legend: () => null,
  Line: () => null,
  Bar: () => null,
  Rectangle: () => null,
}));
beforeEach(() => {
  state.data = undefined;
  state.loading = false;
  state.active = true;
  state.lineData = [];
  state.barData = [];
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
      { date: '2026-01-02', minutes: 20, sessions: 2, spend: 1234 },
      { date: 'Unknown', minutes: 0, sessions: 0, spend: 0 },
    ],
    topResources: [{ resourceId: 1, resourceName: 'Lathe', minutes: 20, sessions: 2, spend: 1234 }],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(state.lineData).toEqual([
    { date: '2026-01-02', minutes: 20, sessions: 2, spend: 12.34 },
    { date: 'Unknown', minutes: 0, sessions: 0, spend: 0 },
  ]);
  expect(state.barData).toEqual(state.data.topResources);
  expect(screen.getByText('Lathe')).toBeTruthy();
  expect(screen.getByText('EUR 12.34')).toBeTruthy();
  expect(screen.getByText('EUR 125.00')).toBeTruthy();
  expect(screen.getByText('EUR 1.25')).toBeTruthy();
  expect(screen.getAllByText('12.00')).toHaveLength(2);
  expect(screen.getAllByText('0.00')).toHaveLength(2);
});
it('hides tooltips when no point is active', () => {
  state.active = false;
  state.data = {
    summary: { currency: 'JPY', minorUnit: 0 },
    timeSeries: [{ date: '2026-01-02', minutes: 1, sessions: 1, spend: 100 }],
    topResources: [{ resourceId: 1, resourceName: 'Saw', minutes: 1, sessions: 1, spend: 100 }],
  };
  render(<ProjectUsageCharts projectId={7} />);
  expect(screen.queryByText('Selected point')).toBeNull();
  expect(screen.getByText('JPY 100.00')).toBeTruthy();
});
