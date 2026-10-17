import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarDate } from '@internationalized/date';
import { FileIcon } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { SelectedRangePill } from './date-range-section/selected-range-pill';
import { ExportTypeCard } from './export-type-section/export-type-card';
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useDateTimeFormatter: () => (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
}));
afterEach(cleanup);
it('summarizes a selected inclusive date range and an absent range', () => {
  const summary = ({ start, end, days }: { start: string; end: string; days: number }) =>
    `${start} to ${end}: ${days} days`;
  const view = render(<SelectedRangePill range={null} emptyLabel="Choose dates" summaryLabel={summary} />);
  expect(screen.getByText('Choose dates')).toBeTruthy();
  view.rerender(
    <SelectedRangePill
      range={{ start: new CalendarDate(2026, 9, 1), end: new CalendarDate(2026, 9, 3) }}
      emptyLabel="Choose dates"
      summaryLabel={summary}
      dataCy="range"
    />,
  );
  expect(screen.getByText('2026-9-1 to 2026-9-3: 3 days')).toBeTruthy();
  expect(document.querySelector('[data-cy="range"]')).toBeTruthy();
});
it.each([
  { status: 'pending', count: undefined, disabled: false, expected: 'Counting rows' },
  { status: 'error', count: undefined, disabled: false, expected: '0 rows' },
  { status: 'success', count: 42, disabled: false, expected: '42 rows' },
  { status: 'idle', count: undefined, disabled: false, expected: '0 rows' },
  { status: 'success', count: 42, disabled: true, expected: 'Choose a range first' },
] as const)('shows $expected for $status export availability', ({ status, count, disabled, expected }) => {
  const exportRows = vi.fn();
  render(
    <ExportTypeCard
      Icon={FileIcon}
      title="Sessions"
      description="Usage CSV"
      rowCount={count}
      rowCountStatus={status}
      estimatedLabel={({ count }) => `${count} rows`}
      loadingLabel="Counting rows"
      ctaLabel="Export"
      requireRangeLabel="Choose a range first"
      isDisabled={disabled}
      onPress={exportRows}
      dataCy="usage"
    />,
  );
  expect(screen.getByText(expected)).toBeTruthy();
  const button = screen.getByRole('button', { name: 'Export' });
  if (disabled) expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(exportRows).toHaveBeenCalledTimes(disabled ? 0 : 1);
});
