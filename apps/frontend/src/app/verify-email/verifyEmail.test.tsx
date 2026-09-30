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

const verifyMutateMock = vi.fn();
const resendMutateMock = vi.fn();
let verifyOnError: ((error: unknown) => void) | undefined;
let verifyOnSuccess: (() => void) | undefined;
let resendOnSuccess: (() => void) | undefined;

vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const actual = await vi.importActual<typeof import('@attraccess/plugins-frontend-ui')>(
    '@attraccess/plugins-frontend-ui',
  );
  return {
    ...actual,
    useTranslations: () => {
      const translations: Record<string, string> = {
        'success.title': 'Email Verified!',
        'success.message': 'Your email has been successfully verified.',
        'success.goToLogin': 'Go to Login',
        'error.title': 'Verification Failed',
        'error.tryAgain': 'Try Again',
        'error.backToLogin': 'Back to Login',
        'error.errorTitle': 'Error',
        'resend.prompt': 'Need a new verification link?',
        'resend.emailLabel': 'Email address',
        'resend.button': 'Resend verification email',
        'resend.successTitle': 'Email sent!',
        'resend.successMessage': 'A new verification link has been sent.',
        'apiErrors.UserEmailInvalidVerificationTokenException': 'Invalid verification token.',
        'apiErrors.UserEmailVerificationTokenExpiredException': 'Your verification link has expired.',
        'apiErrors.invalidLink': 'Invalid verification link.',
        'apiErrors.unexpectedError': 'An unexpected error occurred',
      };

      const t = (key: string) => translations[key] ?? key;
      const tExists = (key: string) => Boolean(translations[key]);
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
      expect(screen.getByText('Email Verified!')).toBeInTheDocument();
      expect(screen.getByText('Go to Login')).toBeInTheDocument();
    });
  });

  it('shows error card and resend form when verification fails', async () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=expired');
    act(() => verifyOnError?.(new Error('expired')));

    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument();
      expect(screen.getByText('Need a new verification link?')).toBeInTheDocument();
      expect(screen.getByTestId('resend-email-input')).toBeInTheDocument();
      expect(screen.getByTestId('resend-verification-button')).toBeInTheDocument();
    });
  });

  it('pre-fills email from URL in the resend input', async () => {
    renderWithRoute('/verify-email?email=prefilled%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByLabelText('Email address')).toHaveValue('prefilled@example.com');
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
      expect(screen.getByText('Email sent!')).toBeInTheDocument();
    });
  });

  it('does not call verifyEmail when URL has no params', () => {
    renderWithRoute('/verify-email');

    expect(verifyMutateMock).not.toHaveBeenCalled();
  });

  it('shows Try Again and Back to Login buttons on error', async () => {
    renderWithRoute('/verify-email?email=test%40example.com&token=bad');
    act(() => verifyOnError?.(new Error('bad')));

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Back to Login')).toBeInTheDocument();
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
