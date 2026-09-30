import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectSummaryCards } from './index';
const state = vi.hoisted(() => ({
  loading: false,
  summary: undefined as
    | undefined
    | { totalSessions?: number; totalMinutes?: number; totalSpend?: number; currency: string; minorUnit: number },
  query: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useNumberFormatter: () => (value: number) => value.toFixed(2),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useProjectsServiceGetProjectUsageStats: (params: unknown) => {
    state.query(params);
    return { data: { summary: state.summary }, isLoading: state.loading };
  },
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.summary = undefined;
});
it('shows empty results and loads the requested project', () => {
  render(<ProjectSummaryCards projectId={7} />);
  expect(state.query).toHaveBeenCalledWith({ id: 7 });
  expect(screen.getAllByText('summary.empty')).toHaveLength(3);
});
it('shows skeletons while loading instead of an empty result', () => {
  state.loading = true;
  render(<ProjectSummaryCards projectId={7} />);
  expect(screen.queryByText('summary.empty')).toBeNull();
  expect(document.querySelectorAll('.skeleton')).toHaveLength(3);
});
it('formats sessions, minutes and database currency amounts', () => {
  state.summary = { totalSessions: 4, totalMinutes: 90, totalSpend: 12345, currency: 'EUR', minorUnit: 2 };
  render(<ProjectSummaryCards projectId={7} />);
  expect(screen.getByText('4.00')).toBeTruthy();
  expect(screen.getByText('90.00')).toBeTruthy();
  expect(screen.getByText('EUR 123.45')).toBeTruthy();
});
it('defaults omitted totals to zero and respects currencies without fractional units', () => {
  state.summary = { totalSpend: 123, currency: 'JPY', minorUnit: 0 };
  render(<ProjectSummaryCards projectId={7} />);
  expect(screen.getAllByText('0.00')).toHaveLength(2);
  expect(screen.getByText('JPY 123.00')).toBeTruthy();
});
