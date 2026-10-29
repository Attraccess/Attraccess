import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailForm } from './index';
import { QueryWrapper } from '../../../test-utils/wrappers';

const mutate = vi.fn();
let hookOptions: { onSuccess?: () => void } = {};

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  useUsersServiceChangeMyEmail: (options: typeof hookOptions) => {
    hookOptions = options;
    return { mutate, isPending: false };
  },
  useUsersServiceGetCurrent: () => ({ data: { email: 'current@example.com' }, isLoading: false }),
  useUsersServiceGetCurrentKey: 'current-user',
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
  ...(await (() => ({
    Button: ({
      children,
      onPress,
      isDisabled,
    }: {
      children: React.ReactNode;
      onPress: () => void;
      isDisabled?: boolean;
    }) => (
      <button type="button" onClick={onPress} disabled={isDisabled}>
        {children}
      </button>
    ),
  }))()),
  ...(await (() => ({
    StatusDialog: ({
      isOpen,
      title,
      children,
      closeLabel,
      onClose,
      action,
    }: {
      isOpen: boolean;
      title: React.ReactNode;
      children?: React.ReactNode;
      closeLabel?: React.ReactNode;
      onClose: () => void;
      action?: { label: React.ReactNode; onPress: () => void };
    }) =>
      isOpen ? (
        <div role="alertdialog" aria-label={String(title)}>
          <div>{children}</div>
          <button type="button" onClick={onClose}>
            {closeLabel}
          </button>
          <button type="button" onClick={action?.onPress}>
            {action?.label}
          </button>
        </div>
      ) : null,
  }))()),
}));

vi.mock('@heroui/react', () => ({
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
  useOverlayState: () => {
    const [isOpen, setIsOpen] = useState(false);
    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
  },
}));

vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));

describe('EmailForm', () => {
  beforeEach(() => mutate.mockClear());

  it('requires confirmation before changing the email address', async () => {
    const user = userEvent.setup();
    render(<EmailForm />, { wrapper: QueryWrapper });

    expect(screen.getByText('Current email').parentElement).toHaveAttribute('data-value', 'current@example.com');

    await user.type(screen.getAllByRole('textbox')[1], 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Sign-in warning')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(mutate).toHaveBeenCalledWith({ requestBody: { email: 'new@example.com' } });

    // A failed request keeps the dialog open; only success closes it.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => hookOptions.onSuccess?.());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
