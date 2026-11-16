import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CsvExport } from './index';
import {
  BillingTransactionsExportPage,
  ResourceHoursSummaryExportPage,
  ResourceUsageExportPage,
} from './configure-page';

vi.mock('./resource-usage', () => ({
  ResourceUsageExport: ({ start, end }: { start: Date; end: Date }) => (
    <div data-testid="usage">{`${start.toISOString()}|${end.toISOString()}`}</div>
  ),
}));
vi.mock('./resource-hours-summary', () => ({
  ResourceHoursSummaryExport: ({ start, end }: { start: Date; end: Date }) => (
    <div data-testid="hours">{`${start.toISOString()}|${end.toISOString()}`}</div>
  ),
}));
vi.mock('./billing-transactions', () => ({
  BillingTransactionsExport: ({ start, end }: { start: Date; end: Date }) => (
    <div data-testid="billing">{`${start.toISOString()}|${end.toISOString()}`}</div>
  ),
}));
vi.mock('./date-range-section', () => ({ DateRangeSection: () => <div /> }));
vi.mock('./export-type-section', () => ({
  ExportTypeSection: ({ onOpen }: { onOpen: (key: string) => void }) => (
    <>
      <button onClick={() => onOpen('resourceUsageHours')}>open usage</button>
      <button onClick={() => onOpen('resourceHoursSummary')}>open hours</button>
      <button onClick={() => onOpen('billingTransactions')}>open billing</button>
    </>
  ),
}));

afterEach(cleanup);

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/csv-export" element={<CsvExport />} />
        <Route path="/csv-export/resource-usage-hours" element={<ResourceUsageExportPage />} />
        <Route path="/csv-export/resource-hours-summary" element={<ResourceHoursSummaryExportPage />} />
        <Route path="/csv-export/billing-transactions" element={<BillingTransactionsExportPage />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );

const START = '2026-09-01T00:00:00.000Z';
const END = '2026-09-10T21:59:59.999Z';

it('opens the dedicated page of the clicked export type with the range in the URL, without a drawer', () => {
  renderAt('/csv-export');
  expect(document.querySelector('[data-cy="csv-export-modal"]')).toBeNull();
  fireEvent.click(screen.getByText('open usage'));
  const location = screen.getByTestId('location').textContent ?? '';
  expect(location).toMatch(/^\/csv-export\/resource-usage-hours\?start=.+&end=.+$/);
  const params = new URLSearchParams(location.split('?')[1]);
  expect(Number.isNaN(new Date(params.get('start') ?? '').getTime())).toBe(false);
  expect(Number.isNaN(new Date(params.get('end') ?? '').getTime())).toBe(false);
  expect(screen.getByTestId('usage')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  fireEvent.click(screen.getByText('open billing'));
  expect(screen.getByTestId('location').textContent).toMatch(/^\/csv-export\/billing-transactions\?/);
});

it('keeps the range of the URL on the config page (reload or deep link)', () => {
  renderAt(`/csv-export/billing-transactions?start=${START}&end=${END}`);
  expect(screen.getByTestId('billing').textContent).toBe(`${START}|${END}`);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Billing Transactions');
  expect(document.querySelector('[data-cy="csv-export-page-range-pill"]')).toBeTruthy();
});

it('reopens an export with the identical range after going back to the landing page', () => {
  // local day bounds, as the landing page writes them (start of the first day, end of the last day)
  const search = new URLSearchParams({
    start: new Date(2026, 8, 1).toISOString(),
    end: new Date(2026, 8, 10, 23, 59, 59, 999).toISOString(),
  }).toString();
  renderAt(`/csv-export/resource-usage-hours?${search}`);
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByTestId('location').textContent).toBe(`/csv-export?${search}`);
  fireEvent.click(screen.getByText('open billing'));
  expect(screen.getByTestId('location').textContent).toBe(`/csv-export/billing-transactions?${search}`);
});

it.each(['', '?start=garbage&end=nope', `?start=${END}&end=${START}`])(
  'falls back to the last 30 days for missing or invalid params (%j)',
  (search) => {
    renderAt(`/csv-export/resource-usage-hours${search}`);
    const [start, end] = (screen.getByTestId('usage').textContent ?? '').split('|').map((value) => new Date(value));
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(30);
  },
);

it('the back button returns to the landing page and keeps the range', () => {
  renderAt(`/csv-export/resource-usage-hours?start=${START}&end=${END}`);
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByTestId('location').textContent).toBe(
    `/csv-export?${new URLSearchParams({ start: START, end: END }).toString()}`,
  );
});

it('opens the resource hours summary page with the range in the URL', () => {
  renderAt('/csv-export');
  fireEvent.click(screen.getByText('open hours'));
  expect(screen.getByTestId('location').textContent ?? '').toMatch(
    /^\/csv-export\/resource-hours-summary\?start=.+&end=.+$/,
  );
  expect(screen.getByTestId('hours')).toBeInTheDocument();
});
