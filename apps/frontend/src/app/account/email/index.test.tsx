import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailForm } from './index';
import { QueryWrapper } from '../../../test-utils/wrappers';

const mutateAsync = vi.fn();

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  useChangeMyEmail: () => ({ mutateAsync, isPending: false }),
  useGetCurrent: () => ({ data: { email: 'current@example.com' }, isLoading: false }),
  useGetCurrentKey: 'current-user',
}));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({
      t: (key: string) =>
        ({
          'email.currentLabel': 'Current email',
          'email.newLabel': 'New email',
          'actions.save': 'Save',
          'actions.cancel': 'Cancel',
          'actions.confirm': 'Change email',
          'modal.title': 'Confirm email change',
          'modal.warning': 'Sign-in warning',
        })[key] ?? key,
    }),
  }))()),
}));

vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@heroui/react')>()),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  TextField: ({
    children,
    value,
    onChange,
  }: {
    children: React.ReactNode;
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <div data-value={value} onChange={(event) => onChange?.((event.target as HTMLInputElement).value)}>
      {children}
    </div>
  ),
}));

vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));

describe('EmailForm', () => {
  beforeEach(() => mutateAsync.mockReset());

  it('requires confirmation before changing the email address', async () => {
    const user = userEvent.setup();
    render(<EmailForm />, { wrapper: QueryWrapper });

    expect(screen.getByText('Current email').parentElement).toHaveAttribute('data-value', 'current@example.com');

    await user.type(screen.getAllByRole('textbox')[1], 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Sign-in warning')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    // A failed request keeps the dialog open; only success closes it.
    mutateAsync.mockRejectedValueOnce(new Error('request failed'));
    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(mutateAsync).toHaveBeenCalledWith({ body: { email: 'new@example.com' } });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    mutateAsync.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
