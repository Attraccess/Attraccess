import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from './en.json';
import de from './de.json';
import { ResetPassword } from './resetPassword';

const navigateMock = vi.fn();

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'de', pending: false, success: true }));

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useUrlQuery: () => new URLSearchParams('token=test&userId=1'),
    useTranslations: () => ({
      t: (key: string) =>
        key
          .split('.')
          .reduce<unknown>(
            (value, part) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
            state.locale === 'en' ? en : de,
          ) as string,
    }),
  }))()),
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

describe('ResetPassword layout', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    state.locale = 'en';
    state.pending = false;
    state.success = false;
  });

  it('renders the form without its own full-height centering wrapper', () => {
    state.success = false;
    const { container } = render(<ResetPassword />);

    // Regression: the form must not reintroduce min-h-screen items-center centering,
    // which pushed the CTA below the fold on small screens (it belongs to UnauthorizedLayout).
    expect(screen.getByRole('button', { name: en.submit })).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).not.toBeInTheDocument();
  });

  it('renders the success card without its own full-height centering wrapper', () => {
    state.success = true;
    const { container } = render(<ResetPassword />);

    expect(screen.getByText(en.success.title)).toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).not.toBeInTheDocument();
  });
});
