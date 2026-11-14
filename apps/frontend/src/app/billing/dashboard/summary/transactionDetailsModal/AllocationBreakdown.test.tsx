import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AllocationBreakdown, getItemAllocation, sumDecimals } from './AllocationBreakdown';

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
}));
afterEach(cleanup);

const t = (key: string, params?: Record<string, string | number>) =>
  `${key}${params ? ' ' + JSON.stringify(params) : ''}`;
const segments = [
  {
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: '2026-01-01T10:30:00Z',
    participants: 1,
    totalQuantity: '1.2',
    totalCredits: 36,
    shareQuantity: '1.2',
    shareCredits: 36,
  },
  {
    startedAt: '2026-01-01T10:30:00Z',
    endedAt: '2026-01-01T11:00:00Z',
    participants: 3,
    totalQuantity: '1.2',
    totalCredits: 36,
    shareQuantity: '0.4',
    shareCredits: 12,
  },
];

it('sums decimals exactly', () => {
  expect(sumDecimals(['1.2', '1.2'])).toBe('2.4');
  expect(sumDecimals(['100', '0.05'])).toBe('100.05');
  expect(sumDecimals(['3', '4'])).toBe('7');
  expect(sumDecimals([])).toBe('0');
});

it('treats a missing or malformed allocation as solo', () => {
  expect(getItemAllocation({})).toBeNull();
  expect(getItemAllocation({ allocation: null })).toBeNull();
  expect(getItemAllocation({ allocation: { kind: 'meter' } })).toBeNull();
});

it('shows the marker, the share against the total and one row per segment for a meter', () => {
  render(
    <AllocationBreakdown
      allocation={{ kind: 'meter', segments }}
      t={t}
      formatMeterValue={(v) => v}
      formatCredits={(c) => `c${c}`}
      shareValue="1.6"
    />,
  );
  expect(screen.getByText('items.allocation.shared')).toBeInTheDocument();
  expect(screen.getByText('items.allocation.shareLine {"share":"1.6","total":"2.4"}')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-cy="allocation-segment"]')).toHaveLength(2);
  expect(
    screen.getByText(
      'items.allocation.segment {"people":3,"total":"1.2","totalCredits":"c36","share":"0.4","shareCredits":"c12"}',
    ),
  ).toBeInTheDocument();
});

it('formats running time shares as durations', () => {
  render(
    <AllocationBreakdown
      allocation={{
        kind: 'operating-time',
        segments: [{ ...segments[1], totalQuantity: '3600000', shareQuantity: '1200000' }],
      }}
      t={t}
      formatMeterValue={(v) => v}
      formatCredits={(c) => `c${c}`}
      shareValue="1200000"
    />,
  );
  expect(screen.getByText('items.allocation.shareLine {"share":"0:20:00","total":"1:00:00"}')).toBeInTheDocument();
});
