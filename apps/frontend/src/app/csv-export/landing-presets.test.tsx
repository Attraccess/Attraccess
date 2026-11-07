import { cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CsvExport } from './index';

vi.mock('./export-type-section', () => ({ ExportTypeSection: () => <div /> }));

afterEach(cleanup);

const preset = (key: string) => document.querySelector(`[data-cy="csv-export-preset-${key}"]`) as HTMLElement;

it('keeps a clicked preset selected instead of flipping the chip to "custom"', () => {
  render(
    <MemoryRouter initialEntries={['/csv-export']}>
      <CsvExport />
    </MemoryRouter>,
  );
  expect(preset('last30d')).toHaveAttribute('data-selected', 'true');

  fireEvent.click(preset('last7d'));

  expect(preset('last7d')).toHaveAttribute('data-selected', 'true');
  expect(preset('custom')).not.toHaveAttribute('data-selected', 'true');
  expect(document.querySelector('[data-cy="csv-export-range-calendar"]')).toBeNull();
  // the pill follows the preset: 7 days
  expect(document.body.textContent).toMatch(/· 7 days/);
});

it('switches to "custom" and shows the calendar when custom is picked', () => {
  render(
    <MemoryRouter initialEntries={['/csv-export']}>
      <CsvExport />
    </MemoryRouter>,
  );
  fireEvent.click(preset('custom'));
  expect(preset('custom')).toHaveAttribute('data-selected', 'true');
  expect(document.querySelector('[data-cy="csv-export-range-calendar"]')).not.toBeNull();
});
