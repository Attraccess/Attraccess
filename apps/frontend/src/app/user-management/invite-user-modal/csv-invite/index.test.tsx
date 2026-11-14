import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CSV_ROW_ERROR_REASON_KEYS, CsvInvite, type CsvRowError, getCsvRowErrorReasonKey } from './index';
import en from './en.json';
import de from './de.json';
import { TestWrapper } from '../../../../test-utils/wrappers';

let inviteFromCsvOptions: { onError?: (error: unknown) => void } | undefined;

function translate(translations: Record<string, unknown>, key: string) {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], translations);
  return typeof value === 'string' ? value : undefined;
}

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => translate(en, key) ?? key }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useRbacServiceListRoles: () => ({ data: [] }),
  useUsersServiceInviteUsersFromCsv: (options: typeof inviteFromCsvOptions) => {
    inviteFromCsvOptions = options;
    return { mutate: vi.fn(), isPending: false };
  },
  useUsersServiceFindManyKey: 'useUsersServiceFindManyKey',
}));

describe('CsvInvite', () => {
  beforeEach(() => {
    inviteFromCsvOptions = undefined;
  });

  it('anchors the import error count badge to an accessible heading', () => {
    render(<CsvInvite />, { wrapper: TestWrapper });

    act(() => {
      inviteFromCsvOptions?.onError?.({
        body: {
          errors: [
            { row: 2, message: 'Invalid email' },
            { row: 3, message: 'Username is required' },
          ],
        },
      });
    });

    const heading = screen.getByRole('heading', { name: 'Import errors' });
    const anchor = heading.closest('[data-slot="badge-anchor"]');
    const badge = anchor?.querySelector('[data-slot="badge"]');

    expect(heading).toBeInTheDocument();
    expect(anchor).toBeInTheDocument();
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('2');
    expect(anchor).toContainElement(badge as HTMLElement);
  });

  it('translates known row error reasons and fields and leaves unknown ones unchanged', () => {
    render(<CsvInvite />, { wrapper: TestWrapper });

    act(() => {
      inviteFromCsvOptions?.onError?.({
        body: {
          errors: [
            { row: 0, field: 'user', message: 'REQUIRED' },
            { row: 2, field: 'email', message: 'DUPLICATE_IN_DB', value: 'a@example.com' },
            { row: 3, field: 'Mail Column', message: 'SOMETHING_NEW', value: 'b' },
            { row: 4, field: 'username', message: 'Invalid username format', value: 'bad name!' },
            { row: 5, message: 'Row is empty' },
          ],
        },
      });
    });

    const rows = within(screen.getByRole('grid', { name: 'csv-invite-errors' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll('td, th'), (cell) => cell.textContent));

    expect(rows).toEqual([
      ['#0', 'user', en.errors.reasons.COLUMN_MISSING, '-'],
      ['#2', en.inputs.fieldMapping.email, en.errors.reasons.DUPLICATE_IN_DB, 'a@example.com'],
      ['#3', 'Mail Column', 'SOMETHING_NEW', 'b'],
      ['#4', en.inputs.fieldMapping.username, en.errors.reasons.INVALID_USERNAME_FORMAT, 'bad name!'],
      ['#5', '-', en.errors.reasons.ROW_IS_EMPTY, '-'],
    ]);
  });

  it.each([
    ['English', en],
    ['German', de],
  ])('has a %s translation for every CSV row error reason', (_locale, translations) => {
    const missingColumn: CsvRowError = { row: 0, field: 'email', message: 'REQUIRED' };
    const keys = [
      ...Object.keys(CSV_ROW_ERROR_REASON_KEYS).map((message) => getCsvRowErrorReasonKey({ row: 1, message })),
      getCsvRowErrorReasonKey(missingColumn),
      'inputs.fieldMapping.email',
      'inputs.fieldMapping.username',
    ];

    keys.forEach((key) => expect(translate(translations, key as string), key).toBeTruthy());
    expect(Object.keys(translations.errors.reasons).sort()).toEqual(Object.keys(en.errors.reasons).sort());
  });
});
