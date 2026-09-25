import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetForm } from './passwordResetForm';
import { TestWrapper } from '../../../test-utils/wrappers';

const locale = vi.hoisted(() => ({ current: 'en' }));

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = locale.current === 'de' ? {
        title: 'Passwort zurücksetzen',
        goBackButton: 'Zurück zur Anmeldung',
        mainButton: 'Passwort zurücksetzen',
        emailLabel: 'E-Mail-Adresse',
      } : {
        title: 'Password Reset',
        goBackButton: 'Back to sign in',
        mainButton: 'Reset password',
        emailLabel: 'Email address',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceRequestPasswordReset: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('PasswordResetForm labels', () => {
  beforeEach(() => {
    locale.current = 'en';
  });

  it.each([
    ['en', 'Back to sign in', 'Email address', 'Reset password'],
    ['de', 'Zurück zur Anmeldung', 'E-Mail-Adresse', 'Passwort zurücksetzen'],
  ])('uses descriptive recovery labels in %s', (language, backLabel, emailLabel, submitLabel) => {
    locale.current = language;
    render(<PasswordResetForm onGoBack={vi.fn()} />, { wrapper: TestWrapper });

    expect(screen.getByRole('button', { name: backLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(emailLabel)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: submitLabel })).toBeInTheDocument();
  });
});
