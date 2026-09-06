import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvInvite } from './index';
import { TestWrapper } from '../../../../test-utils/wrappers';

let inviteFromCsvOptions: { onError?: (error: unknown) => void } | undefined;

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string) =>
      ({
        'inputs.file': 'Select file',
        'inputs.fieldMapping.email': 'Email',
        'inputs.fieldMapping.username': 'Username',
        'preview.columns.index': 'Index',
        'preview.columns.username': 'Username',
        'preview.columns.email': 'Email',
        'errors.title': 'Import errors',
        'errors.columns.row': 'Row',
        'errors.columns.field': 'Field',
        'errors.columns.message': 'Reason',
        'errors.columns.value': 'Value',
        'actions.invite': 'Invite',
        'actions.inviteIgnore': 'Invite skipping failed rows',
      })[key] ?? key,
  }),
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
    const badge = anchor?.querySelector<HTMLElement>('[data-slot="badge"]');

    expect(heading).toBeInTheDocument();
    expect(anchor).toBeInTheDocument();
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('2');
    expect(anchor).toContainElement(badge);
  });
});
