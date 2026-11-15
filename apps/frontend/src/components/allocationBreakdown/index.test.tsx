import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AllocationBreakdown, AllocationShareSummary, getItemAllocation, sumDecimals } from './index';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ' ' + JSON.stringify(params) : ''}`,
  }),
  DateTimeDisplay: ({ date, options }: { date: string; options?: { showDate?: boolean } }) => (
    <span>{options?.showDate === false ? `time:${date}` : date}</span>
  ),
}));
afterEach(cleanup);

const segments = [
  {
    startedAt: '2026-01-01T10:00:00',
    endedAt: '2026-01-01T10:30:00',
    participants: 1,
    totalQuantity: '1.2',
    totalCredits: 36,
    shareQuantity: '1.2',
    shareCredits: 36,
  },
  {
    startedAt: '2026-01-01T23:30:00',
    endedAt: '2026-01-02T00:30:00',
    participants: 3,
    totalQuantity: '1.2',
    totalCredits: 36,
    shareQuantity: '0.4',
    shareCredits: 12,
  },
];
const format = { formatMeterValue: (v: string) => v, formatCredits: (c: number | bigint) => `c${c}` };

it('sums decimals exactly', () => {
  expect(sumDecimals(['1.2', '1.2'])).toBe('2.4');
  expect(sumDecimals(['100', '0.05'])).toBe('100.05');
  expect(sumDecimals(['3', '4'])).toBe('7');
  expect(sumDecimals([])).toBe('0');
});

it('treats a missing or malformed allocation as solo and keeps the pending flag', () => {
  expect(getItemAllocation({})).toBeNull();
  expect(getItemAllocation({ allocation: null })).toBeNull();
  expect(getItemAllocation({ allocation: { kind: 'meter' } })).toBeNull();
  expect(getItemAllocation({ allocation: { kind: 'meter', segments: [], pending: true } })).toEqual({
    kind: 'meter',
    segments: [],
    pending: true,
  });
});

it('shows the marker and the share against the total', () => {
  render(<AllocationShareSummary allocation={{ kind: 'meter', segments }} shareValue="1.6" {...format} />);
  expect(screen.getByText('shared')).toBeInTheDocument();
  expect(screen.getByText('shareLine {"share":"1.6","total":"2.4"}')).toBeInTheDocument();
});

it('words the share of a running session as so far', () => {
  render(<AllocationShareSummary allocation={{ kind: 'meter', segments }} soFar {...format} />);
  expect(screen.getByText('shareLineSoFar {"share":"1.6","total":"2.4"}')).toBeInTheDocument();
});

it('formats running time shares as durations', () => {
  render(
    <AllocationShareSummary
      allocation={{
        kind: 'operating-time',
        segments: [{ ...segments[1], totalQuantity: '3600000', shareQuantity: '1200000' }],
      }}
      shareValue="1200000"
      {...format}
    />,
  );
  expect(screen.getByText('shareLine {"share":"0:20:00","total":"1:00:00"}')).toBeInTheDocument();
});

it('lists one compact row per segment, with the end date only when it differs', () => {
  render(
    <AllocationBreakdown entries={[{ id: 1, name: 'Energy', allocation: { kind: 'meter', segments } }]} {...format} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'breakdown {"name":"Energy"}' }));
  expect(document.querySelectorAll('[data-cy="allocation-segment"]')).toHaveLength(2);
  expect(screen.getByText('time:2026-01-01T10:30:00')).toBeInTheDocument();
  expect(screen.getByText('2026-01-02T00:30:00')).toBeInTheDocument();
  expect(
    screen.getByText(
      'segment {"people":"people {\\"count\\":3}","total":"1.2","totalCredits":"c36","share":"0.4","shareCredits":"c12"}',
    ),
  ).toBeInTheDocument();
});

it('marks the open segment of a running session as provisional', () => {
  render(
    <AllocationBreakdown
      entries={[{ id: 1, name: 'Energy', allocation: { kind: 'meter', segments }, provisional: true }]}
      {...format}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'breakdown {"name":"Energy"}' }));
  expect(screen.getByText('now')).toBeInTheDocument();
  expect(screen.getByText('(provisional)')).toBeInTheDocument();
  expect(screen.queryByText('2026-01-02T00:30:00')).not.toBeInTheDocument();
});

it('renders nothing for pending or empty allocations', () => {
  const { container } = render(
    <AllocationBreakdown
      entries={[{ id: 1, name: 'Energy', allocation: { kind: 'meter', segments: [], pending: true } }]}
      {...format}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
