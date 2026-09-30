import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEmailForm } from './index';
import { QueryWrapper } from '../../../../../test-utils/wrappers';

const mutate = vi.fn();

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {},
  UseUsersServiceGetOneUserByIdKeyFn: vi.fn(),
  useUsersServiceChangeUserEmail: () => ({ mutate, isPending: false }),
  useUsersServiceFindManyKey: 'users',
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
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
}));

vi.mock('@heroui/react', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  TextField: ({ children, value, onChange }: { children: React.ReactNode; value: string; onChange: (value: string) => void }) => (
    <div onChange={(event) => onChange((event.target as HTMLInputElement).value)}>{children}</div>
  ),
  useOverlayState: () => {
    const [isOpen, setIsOpen] = useState(false);
    return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
  },
}));

vi.mock('../../../../../components/button', () => ({
  Button: ({ children, onPress, isDisabled }: { children: React.ReactNode; onPress: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>
      {children}
    </button>
  ),
}));

vi.mock('../../../../../components/AlertStatusIcon', () => ({ AlertStatusIcon: () => null }));

vi.mock('../../../../../components/standardModal', () => ({
  StandardModal: ({ isOpen, children }: { isOpen: boolean; children: (props: { close: () => void }) => React.ReactNode }) =>
    isOpen ? <div>{children({ close: vi.fn() })}</div> : null,
}));

vi.mock('../../../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));

describe('ChangeEmailForm', () => {
  beforeEach(() => mutate.mockClear());

  it('requires confirmation before changing a user email address', async () => {
    const user = userEvent.setup();
    render(<ChangeEmailForm userId={7} />, { wrapper: QueryWrapper });

    expect(screen.getByText("The current email address is not shown to protect this user's privacy.")).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Sign-in warning')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, requestBody: { email: 'new@example.com' } });
  });
});
