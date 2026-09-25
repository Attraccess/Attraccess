import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmail } from './index';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/toastProvider';
import { Providers } from '@attraccess/ui';
import en from './en.json';
import de from './de.json';

const verifyMutateMock = vi.fn();
const resendMutateMock = vi.fn();
const locale = vi.hoisted(() => ({ current: 'en' }));
let verifyOnError: ((error: unknown) => void) | undefined;
let verifyOnSuccess: (() => void) | undefined;
let resendOnSuccess: (() => void) | undefined;

vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const actual = await vi.importActual<typeof import('@attraccess/plugins-frontend-ui')>(
    '@attraccess/plugins-frontend-ui',
  );
  return {
    ...actual,
    useTranslations: (locales: Record<string, Record<string, unknown>>) => {
      const translations = locales[locale.current];
      const lookup = (key: string) => key.split('.').reduce<unknown>(
        (value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
        translations,
      );
      const t = (key: string) => lookup(key) ?? key;
      const tExists = (key: string) => lookup(key) !== undefined;
      return { t, tExists };
    },
  };
});

vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceVerifyEmail: (options: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
    verifyOnSuccess = options?.onSuccess;
    verifyOnError = options?.onError;
    return { mutate: verifyMutateMock, isPending: false };
  },
  useUsersServiceResendVerificationEmail: (options: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
    resendOnSuccess = options?.onSuccess;
    return { mutate: resendMutateMock, isPending: false };
  },
  useUsersServiceGetCurrentKey: 'useUsersServiceGetCurrentKey',
  ApiError: class ApiError extends Error {},
}));

vi.mock('../../utils/apiError', () => ({
  getTranslationKeyForApiError: ({ fallbackKey }: { fallbackKey: string }) => ({
    key: `apiErrors.${fallbackKey}`,
    errorMessage: 'error',
  }),
}));

function renderWithRoute(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Providers>
          <ToastProvider>
            <Routes>
              <Route path="/verify-email" element={<VerifyEmail />} />
            </Routes>
          </ToastProvider>
        </Providers>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    verifyMutateMock.mockReset();
    resendMutateMock.mockReset();
    verifyOnError = undefined;
    verifyOnSuccess = undefined;
    resendOnSuccess = undefined;
    locale.current = 'en';
  });

  it('calls verifyEmail mutation with token and email from URL params', () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=abc123');

    expect(verifyMutateMock).toHaveBeenCalledWith({
      requestBody: { token: 'abc123', email: 'test@example.com' },
    });
  });

  it('shows success card after successful verification', async () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=abc123');
    act(() => verifyOnSuccess?.());

    await waitFor(() => {
      expect(screen.getByText(en.success.title)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to sign in' })).toBeInTheDocument();
    });
  });

  it('shows error card and resend form when verification fails', async () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=expired');
    act(() => verifyOnError?.(new Error('expired')));

    await waitFor(() => {
      expect(screen.getByText(en.error.title)).toBeInTheDocument();
      expect(screen.getByText(en.resend.prompt)).toBeInTheDocument();
      expect(screen.getByTestId('resend-email-input')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument();
    });
  });

  it('shows the German success action after successful verification', async () => {
    locale.current = 'de';
    renderWithRoute('/verify-email?email=test%40example.com&token=abc123');
    act(() => verifyOnSuccess?.());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Zur Anmeldung' })).toBeInTheDocument();
    });
  });

  it('pre-fills email from URL in the resend input', async () => {
    renderWithRoute('/verify-email?email=prefilled%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByLabelText(en.resend.emailLabel)).toHaveValue('prefilled@example.com');
    });
  });

  it('calls resend mutation when resend button is clicked', async () => {
    const user = userEvent.setup();
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resend-verification-button'));

    expect(resendMutateMock).toHaveBeenCalledWith({
      requestBody: { email: 'test@example.com' },
    });
  });

  it('shows success alert after resend succeeds', async () => {
    const user = userEvent.setup();
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resend-verification-button'));
    act(() => resendOnSuccess?.());

    await waitFor(() => {
      expect(screen.getByTestId('resend-success-alert')).toBeInTheDocument();
      expect(screen.getByText(en.resend.successTitle)).toBeInTheDocument();
    });
  });

  it('does not call verifyEmail when URL has no params', () => {
    renderWithRoute('/verify-email');

    expect(verifyMutateMock).not.toHaveBeenCalled();
  });

  it('shows Try Again and Back to sign in buttons on error', async () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Verify email again' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument();
    });
  });

  it('renders German verification and resend controls with descriptive names', async () => {
    locale.current = 'de';
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'E-Mail erneut verifizieren' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zurück zur Anmeldung' })).toBeInTheDocument();
      expect(screen.getByLabelText(de.resend.emailLabel)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Verifizierungsmail erneut senden' })).toBeInTheDocument();
    });
  });

  it('disables resend button when email format is invalid', async () => {
    renderWithRoute('/verify-email?email=not-an-email&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });

    expect(screen.getByTestId('resend-verification-button')).toBeDisabled();
  });

  it('trims surrounding whitespace before submitting the resend request', async () => {
    const user = userEvent.setup();
    renderWithRoute('/verify-email?email=%20%20spaced%40example.com%20%20&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resend-verification-button'));

    expect(resendMutateMock).toHaveBeenCalledWith({
      requestBody: { email: 'spaced@example.com' },
    });
  });

  it('hides resend form and shows success alert after resend succeeds (replaces form)', async () => {
    const user = userEvent.setup();
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('resend-success-alert')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('resend-verification-button'));
    act(() => resendOnSuccess?.());

    await waitFor(() => {
      expect(screen.getByTestId('resend-success-alert')).toBeInTheDocument();
      expect(screen.queryByTestId('resend-verification-button')).not.toBeInTheDocument();
    });
  });
});
