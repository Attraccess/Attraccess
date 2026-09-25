import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from './en.json';
import de from './de.json';
import { ResetPassword } from './resetPassword';

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'de' }));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useUrlQuery: () => new URLSearchParams('token=test&userId=1'),
  useTranslations: () => ({ t: (key: string) => key.split('.').reduce<unknown>(
    (value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
    state.locale === 'en' ? en : de,
  ) as string }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceChangePasswordViaResetToken: () => ({ mutate: vi.fn(), isPending: false, isSuccess: true }),
}));
vi.mock('../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn(), success: vi.fn() }) }));

describe('ResetPassword completion labels', () => {
  beforeEach(() => { state.locale = 'en'; });

  it.each(['en', 'de'] as const)('renders the translated sign-in action in %s', (locale) => {
    state.locale = locale;
    const translations = locale === 'en' ? en : de;
    render(<ResetPassword />);

    expect(screen.getByText(translations.success.title)).toBeInTheDocument();
    expect(screen.getByText(translations.success.message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.success.goToLogin })).toBeInTheDocument();
  });
});
