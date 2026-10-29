import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEmailForm } from './index';
import { QueryWrapper } from '../../../../../test-utils/wrappers';

const mutate = vi.fn();
let hookOptions: { onSuccess?: () => void } = {};

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  UseUsersServiceGetOneUserByIdKeyFn: vi.fn(),
  useUsersServiceChangeUserEmail: (options: typeof hookOptions) => {
    hookOptions = options;
    return { mutate, isPending: false };
  },
  useUsersServiceFindManyKey: 'users',
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
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  TextField: ({
    children,
    value,
    onChange,
  }: {
    children: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
  }) => <div onChange={(event) => onChange((event.target as HTMLInputElement).value)}>{children}</div>,
  useOverlayState: () => {
    const [isOpen, setIsOpen] = useState(false);
    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
  },
}));

vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('ChangeEmailForm', () => {
  beforeEach(() => mutate.mockClear());

  it('requires confirmation before changing a user email address', async () => {
    const user = userEvent.setup();
    render(<ChangeEmailForm userId={7} />, { wrapper: QueryWrapper });

    expect(
      screen.getByText("The current email address is not shown to protect this user's privacy."),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Sign-in warning')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, requestBody: { email: 'new@example.com' } });

    // A failed request keeps the dialog open; only success closes it.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => hookOptions.onSuccess?.());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
