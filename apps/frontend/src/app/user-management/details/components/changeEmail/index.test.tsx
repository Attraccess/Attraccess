import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEmailForm } from './index';
import { QueryWrapper } from '../../../../../test-utils/wrappers';

const mutateAsync = vi.fn();

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  UseGetOneUserByIdKeyFn: vi.fn(),
  useChangeUserEmail: () => ({ mutateAsync, isPending: false }),
  useFindManyKey: 'users',
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({
      t: (key: string) =>
        ({
          'email.label': 'Email',
          'email.privacyHint': "The current email address is not shown to protect this user's privacy.",
          'actions.save': 'Save',
          'actions.cancel': 'Cancel',
          'actions.confirm': 'Change email',
          'modal.title': 'Confirm email change',
          'modal.warning': 'Sign-in warning',
        })[key] ?? key,
    }),
  }))()),
}));

vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('ChangeEmailForm', () => {
  beforeEach(() => mutateAsync.mockReset());

  it('requires confirmation before changing a user email address', async () => {
    const user = userEvent.setup();
    render(<ChangeEmailForm userId={7} />, { wrapper: QueryWrapper });

    expect(
      screen.getByText("The current email address is not shown to protect this user's privacy."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alertdialog', { name: 'Confirm email change' })).toHaveTextContent(
      'Sign-in warning',
    );
    expect(mutateAsync).not.toHaveBeenCalled();

    // A failed request keeps the dialog open; only success closes it.
    mutateAsync.mockRejectedValueOnce(new Error('request failed'));
    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(mutateAsync).toHaveBeenCalledWith({ path: { id: 7 }, body: { email: 'new@example.com' } });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    mutateAsync.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
