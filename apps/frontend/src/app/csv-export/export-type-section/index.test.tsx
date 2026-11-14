import { cleanup, fireEvent, render } from '@testing-library/react';
import { CalendarDate } from '@internationalized/date';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExportTypeSection } from './index';
const state = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock('@attraccess/react-query-client', () => {
  const rowCount = () => ({ data: { total: 3 }, status: 'success' });
  return {
    useLicenseServiceGetLicenseInformation: () => ({ data: { modules: ['billing'] } }),
    useAnalyticsServiceGetResourceUsageHoursInDateRange: rowCount,
    useAnalyticsServiceGetResourceHoursSummaryInDateRange: rowCount,
    useAnalyticsServiceGetBillingTransactionsInDateRange: rowCount,
  };
});
afterEach(cleanup);
beforeEach(() => {
  state.permissions = [];
});
const range = { start: new CalendarDate(2026, 9, 1), end: new CalendarDate(2026, 9, 3) };
const card = (dataCy: string) => document.querySelector(`[data-cy="${dataCy}-card"]`);
const renderSection = (onOpen = vi.fn()) =>
  render(<ExportTypeSection range={range} onOpen={onOpen} t={(key) => key} />);

it('offers the resource hours summary export to users who may export resource reports', () => {
  state.permissions = ['resources.reports.export'];
  const onOpen = vi.fn();
  renderSection(onOpen);
  expect(card('csv-export-resourceUsageHours')).toBeTruthy();
  expect(card('csv-export-resourceHoursSummary')).toBeTruthy();
  expect(card('csv-export-billingTransactions')).toBeNull();
  fireEvent.click(document.querySelector('[data-cy="csv-export-resourceHoursSummary-button"]') as Element);
  expect(onOpen).toHaveBeenCalledWith('resourceHoursSummary');
});

it('hides the resource exports from users who may only manage billing', () => {
  state.permissions = ['billing.manage'];
  renderSection();
  expect(card('csv-export-resourceHoursSummary')).toBeNull();
  expect(card('csv-export-resourceUsageHours')).toBeNull();
  expect(card('csv-export-billingTransactions')).toBeTruthy();
});
