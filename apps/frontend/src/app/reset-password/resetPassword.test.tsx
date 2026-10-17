import '@testing-library/jest-dom/vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from './en.json';
import de from './de.json';
import { ResetPassword } from './resetPassword';

const navigateMock = vi.fn();

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'de', pending: false, success: true }));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useUrlQuery: () => new URLSearchParams('token=test&userId=1'),
  useTranslations: () => ({
    t: (key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
          state.locale === 'en' ? en : de,
        ) as string,
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceChangePasswordViaResetToken: () => ({
    mutate: vi.fn(),
    isPending: state.pending,
    isSuccess: state.success,
  }),
  usePasswordPolicyServiceGetPublicPasswordPolicy: () => ({ data: undefined }),
}));
vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn(), success: vi.fn() }) }));

describe('ResetPassword completion labels', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    state.locale = 'en';
    state.pending = false;
    state.success = true;
  });

  it.each(['en', 'de'] as const)('renders the translated sign-in action in %s', async (locale) => {
    state.locale = locale;
    const translations = locale === 'en' ? en : de;
    render(<ResetPassword />);

    expect(screen.getByText(translations.success.title)).toBeInTheDocument();
    expect(screen.getByText(translations.success.message)).toBeInTheDocument();
    const label = locale === 'en' ? 'Go to sign in' : 'Zur Anmeldung';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it.each(['en', 'de'] as const)('shows the reset-token pending state in %s', (locale) => {
    state.locale = locale;
    state.pending = true;
    state.success = false;
    render(<ResetPassword />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['en', 'de'] as const)('renders named reset-token form controls in %s', (locale) => {
    state.locale = locale;
    state.success = false;
    const translations = locale === 'en' ? en : de;
    render(<ResetPassword />);

    expect(screen.getByLabelText(translations.inputs.password)).toBeInTheDocument();
    expect(screen.getByLabelText(translations.inputs.confirmPassword)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.submit })).toBeInTheDocument();
  });
});
